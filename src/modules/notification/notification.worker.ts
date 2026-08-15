import { logger } from '../../config/logger.js';
import { recordAudit } from '../../shared/utils/audit.js';
import { listLowStock } from '../inventory/inventory.service.js';
import { Notification } from './notification.model.js';
import { notify } from './notification.service.js';
import { User } from '../user/user.model.js';

// Runs periodically (see core/server.ts) and alerts staff when a variant's
// available stock drops to or below its threshold. Throttled per SKU: at most
// one alert per 24h so a chronically low SKU cannot spam the inbox.
export async function runLowStockAlertJob(): Promise<void> {
  try {
    const lowStock = await listLowStock();
    if (lowStock.length === 0) return;

    const staff = await User.find({ roles: { $in: ['ADMIN', 'SUPPORT'] }, status: 'active' })
      .select('_id')
      .lean();
    if (staff.length === 0) return;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const item of lowStock) {
      const alreadyAlerted = await Notification.exists({
        type: 'low_stock',
        'data.sku': item.sku,
        createdAt: { $gte: since },
      });
      if (alreadyAlerted) continue;

      const body = `SKU ${item.sku} (${item.name}) has only ${item.available} units left (threshold ${item.lowStockThreshold}).`;
      for (const admin of staff) {
        await notify(admin._id.toString(), 'low_stock', 'Low stock alert', body, {
          sku: item.sku,
          variantId: item.variantId,
          available: item.available,
        });
      }
      recordAudit('notification.sent', { type: 'low_stock', sku: item.sku });
    }
  } catch (err) {
    logger.error({ err }, 'Low-stock alert job failed');
    recordAudit('notification.job_failed', { job: 'low_stock' });
  }
}

// Schedules the alert job. Kept separate from the job itself so tests can
// invoke the job directly without touching timers.
export function startBackgroundJobs(): NodeJS.Timeout {
  void runLowStockAlertJob();
  return setInterval(() => {
    void runLowStockAlertJob();
  }, envIntervalMs());
}

function envIntervalMs(): number {
  // Run hourly by default.
  return 60 * 60 * 1000;
}
