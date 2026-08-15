import type { Request, Response } from 'express';
import * as paymentService from './payment.service.js';

// Webhook entry point. Mounted BEFORE the global express.json() parser (see
// core/app.ts) so `req.body` arrives as a raw Buffer — signature verification
// must run over the exact bytes the gateway signed, not a re-encoded object.
// Returns 200 unconditionally once verified so gateways stop retrying; side
// effects are deduplicated inside paymentService.processWebhook.
export async function webhookHandler(req: Request, res: Response): Promise<void> {
  const providerName = (req.params.provider as string | undefined) ?? '';
  const signature = (req.headers['x-webhook-signature'] as string | undefined) ?? '';
  const rawBody = req.body instanceof Buffer ? req.body : Buffer.from(req.body ?? '', 'utf8');

  const result = await paymentService.processWebhook(providerName, rawBody, signature);
  res.status(200).json({ success: true, ...result });
}
