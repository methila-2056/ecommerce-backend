package com.ecommerce.backend.modules.notification;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

/**
 * Fire-and-forget push for in-app notifications (mirrors
 * {@code notification.service.ts}). Best-effort by design: a failure to store
 * a notification must never break the business operation that triggered it.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    public static final String TYPE_ORDER_PLACED = "order_placed";
    public static final String TYPE_ORDER_CONFIRMED = "order_confirmed";
    public static final String TYPE_PAYMENT_FAILED = "payment_failed";
    public static final String TYPE_ORDER_SHIPPED = "order_shipped";
    public static final String TYPE_ORDER_DELIVERED = "order_delivered";
    public static final String TYPE_ORDER_CANCELLED = "order_cancelled";
    public static final String TYPE_REFUND_REQUESTED = "refund_requested";
    public static final String TYPE_REFUND_PROCESSED = "refund_processed";
    public static final String TYPE_LOW_STOCK = "low_stock";

    private final NotificationRepository notificationRepository;
    private final MongoTemplate mongo;

    public NotificationService(NotificationRepository notificationRepository, MongoTemplate mongo) {
        this.notificationRepository = notificationRepository;
        this.mongo = mongo;
    }

    public void notify(String userId, String type, String title, String body, Map<String, Object> data) {
        try {
            Notification notification = new Notification();
            notification.userId = userId;
            notification.type = type;
            notification.title = title;
            notification.body = body;
            notification.data = data;
            notification.readAt = null;
            notification.createdAt = Instant.now();
            notification.updatedAt = notification.createdAt;
            notificationRepository.insert(notification);
        } catch (RuntimeException e) {
            log.warn("Failed to store notification for user {}", userId, e);
        }
    }

    public void notify(String userId, String type, String title, String body) {
        notify(userId, type, title, body, null);
    }

    public record NotificationPublic(
            String id, String type, String title, String body, Map<String, Object> data,
            boolean read, String createdAt) {}

    public record NotificationListResult(List<NotificationPublic> notifications, long total) {}

    public NotificationListResult listNotifications(String userId, int page, int limit, Boolean unreadOnly) {
        Query query = new Query(Criteria.where("userId").is(userId));
        if (Boolean.TRUE.equals(unreadOnly)) {
            query.addCriteria(Criteria.where("readAt").is(null));
        }
        long total = mongo.count(query, Notification.class);
        query.with(Sort.by(Sort.Direction.DESC, "createdAt"))
                .skip((long) (page - 1) * limit)
                .limit(limit);
        List<Notification> notifications = mongo.find(query, Notification.class);
        return new NotificationListResult(
                notifications.stream().map(this::toPublic).toList(), total);
    }

    public long unreadNotificationCount(String userId) {
        return notificationRepository.countByUserIdAndReadAtIsNull(userId);
    }

    public void markNotificationRead(String userId, String notificationId) {
        mongo.updateFirst(
                Query.query(Criteria.where("_id")
                        .is(notificationId)
                        .and("userId")
                        .is(userId)
                        .and("readAt")
                        .is(null)),
                Update.update("readAt", Instant.now()),
                Notification.class);
    }

    public void markAllNotificationsRead(String userId) {
        mongo.updateMulti(
                Query.query(Criteria.where("userId").is(userId).and("readAt").is(null)),
                Update.update("readAt", Instant.now()),
                Notification.class);
    }

    private NotificationPublic toPublic(Notification n) {
        return new NotificationPublic(
                n.id,
                n.type,
                n.title,
                n.body,
                n.data,
                n.readAt != null,
                iso(n.createdAt));
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
