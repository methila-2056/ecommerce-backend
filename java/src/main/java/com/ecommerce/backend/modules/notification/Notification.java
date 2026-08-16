package com.ecommerce.backend.modules.notification;

import java.time.Instant;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

/** In-app notification (collection {@code notifications}, mirrors {@code notification.model.ts}). */
@Document(collection = "notifications")
@CompoundIndexes({
    @CompoundIndex(name = "user_time", def = "{'userId':1,'createdAt':-1}"),
    @CompoundIndex(name = "user_read", def = "{'userId':1,'readAt':1}")
})
public class Notification {

    public static final String TYPE_ORDER_PLACED = "order_placed";
    public static final String TYPE_ORDER_CONFIRMED = "order_confirmed";
    public static final String TYPE_PAYMENT_FAILED = "payment_failed";
    public static final String TYPE_ORDER_SHIPPED = "order_shipped";
    public static final String TYPE_ORDER_DELIVERED = "order_delivered";
    public static final String TYPE_ORDER_CANCELLED = "order_cancelled";
    public static final String TYPE_REFUND_REQUESTED = "refund_requested";
    public static final String TYPE_REFUND_PROCESSED = "refund_processed";
    public static final String TYPE_LOW_STOCK = "low_stock";

    @Id
    public String id;

    public String userId;

    public String type;

    public String title;

    public String body;

    public Map<String, Object> data;

    public Instant readAt;

    public Instant createdAt;

    public Instant updatedAt;
}
