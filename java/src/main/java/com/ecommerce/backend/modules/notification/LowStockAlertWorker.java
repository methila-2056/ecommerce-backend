package com.ecommerce.backend.modules.notification;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.inventory.InventoryService;
import com.ecommerce.backend.modules.inventory.InventoryService.LowStockItem;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Periodically alerts staff when a variant's available stock drops to or below
 * its threshold (mirrors {@code notification.worker.ts}). Throttled per SKU: at
 * most one alert per 24h so a chronically low SKU cannot spam the inbox.
 */
@Component
public class LowStockAlertWorker {

    private static final Logger log = LoggerFactory.getLogger(LowStockAlertWorker.class);

    private static final long THROTTLE_MILLIS = 24 * 60 * 60 * 1000;

    private final InventoryService inventoryService;
    private final UserRepository userRepository;
    private final NotificationRepository notificationRepository;
    private final NotificationService notificationService;
    private final AuditService auditService;

    public LowStockAlertWorker(
            InventoryService inventoryService,
            UserRepository userRepository,
            NotificationRepository notificationRepository,
            NotificationService notificationService,
            AuditService auditService) {
        this.inventoryService = inventoryService;
        this.userRepository = userRepository;
        this.notificationRepository = notificationRepository;
        this.notificationService = notificationService;
        this.auditService = auditService;
    }

    @PostConstruct
    public void runOnStartup() {
        runLowStockAlertJob();
    }

    @Scheduled(fixedDelay = 3600000)
    public void runLowStockAlertJob() {
        try {
            List<LowStockItem> lowStock = inventoryService.listLowStock();
            if (lowStock.isEmpty()) {
                return;
            }
            List<User> staff = userRepository.findByRolesInAndStatus(
                    List.of(Role.ADMIN, Role.SUPPORT), User.STATUS_ACTIVE);
            if (staff.isEmpty()) {
                return;
            }
            Instant since = Instant.now().minusMillis(THROTTLE_MILLIS);

            for (LowStockItem item : lowStock) {
                boolean alreadyAlerted = notificationRepository.countByTypeAndDataSkuSince(
                                Notification.TYPE_LOW_STOCK, item.sku(), since)
                        > 0;
                if (alreadyAlerted) {
                    continue;
                }
                String body = "SKU " + item.sku() + " (" + item.name() + ") has only "
                        + item.available() + " units left (threshold "
                        + item.lowStockThreshold() + ").";
                for (User admin : staff) {
                    notificationService.notify(
                            admin.id,
                            Notification.TYPE_LOW_STOCK,
                            "Low stock alert",
                            body,
                            Map.of("sku", item.sku(), "variantId", item.variantId(),
                                    "available", item.available()));
                }
                auditService.log("notification.sent", null, null,
                        Map.of("type", Notification.TYPE_LOW_STOCK, "sku", item.sku()));
            }
        } catch (RuntimeException e) {
            log.error("Low-stock alert job failed", e);
            auditService.log("notification.job_failed", null, null, Map.of("job", "low_stock"));
        }
    }
}
