package com.ecommerce.backend.modules.order;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Order (collection {@code orders}, mirrors {@code order.model.ts}). */
@Document(collection = "orders")
@CompoundIndexes({
    @CompoundIndex(name = "status_placed", def = "{'status':1,'placedAt':-1}"),
    @CompoundIndex(name = "user_placed", def = "{'userId':1,'placedAt':-1}")
})
public class Order {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_CONFIRMED = "confirmed";
    public static final String STATUS_PROCESSING = "processing";
    public static final String STATUS_PACKED = "packed";
    public static final String STATUS_SHIPPED = "shipped";
    public static final String STATUS_DELIVERED = "delivered";
    public static final String STATUS_CANCELLED = "cancelled";
    public static final String STATUS_REFUND_REQUESTED = "refund_requested";
    public static final String STATUS_REFUNDED = "refunded";

    public static final String PAYMENT_PENDING = "pending";
    public static final String PAYMENT_PAID = "paid";
    public static final String PAYMENT_FAILED = "failed";
    public static final String PAYMENT_REFUNDED = "refunded";
    public static final String PAYMENT_PARTIALLY_REFUNDED = "partially_refunded";

    @Id
    public String id;

    @Indexed(unique = true)
    public String orderNumber;

    @Indexed
    public String userId;

    public List<OrderItem> items = new ArrayList<>();

    public long subtotalCents;

    public long discountTotalCents = 0;

    public String couponCode;

    public long couponDiscountCents = 0;

    public long taxTotalCents = 0;

    public long shippingCents = 0;

    public long totalCents;

    public String currency = "USD";

    public ShippingAddress shippingAddress;

    public String status = STATUS_PENDING;

    public List<OrderStatusEvent> statusHistory = new ArrayList<>();

    public String paymentId;

    public String paymentStatus;

    public boolean stockDeducted = false;

    public Instant placedAt;

    public Instant cancelledAt;

    public String cancelledReason;

    public List<OrderRefund> refunds = new ArrayList<>();

    public Instant createdAt;

    public Instant updatedAt;

    /** Immutable snapshot of what the customer paid for at purchase time. */
    public static class OrderItem {
        public String productId;
        public String variantId;
        public String sku;
        public String name;
        public String image;
        public Map<String, String> attributes = new LinkedHashMap<>();
        public long unitPriceCents;
        public double taxRate;
        public long taxAmountCents;
        public long discountCents;
        public long lineTotalCents;
        public int quantity;
    }

    public static class ShippingAddress {
        public String fullName;
        public String phone;
        public String line1;
        public String line2;
        public String city;
        public String state;
        public String postalCode;
        public String country;
    }

    public static class OrderStatusEvent {
        public String status;
        public String note;
        public String changedBy;
        public Instant at;
    }

    public static class OrderRefund {
        public long amountCents;
        public String reason;
        public String status = "requested";
        public String paymentRefundId;
        public Instant at;
    }
}
