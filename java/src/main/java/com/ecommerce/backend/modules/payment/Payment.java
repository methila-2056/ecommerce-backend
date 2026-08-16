package com.ecommerce.backend.modules.payment;

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

/** Payment (collection {@code payments}, mirrors {@code payment.model.ts}). */
@Document(collection = "payments")
@CompoundIndexes({
    @CompoundIndex(name = "provider_reference", def = "{'provider':1,'providerReference':1}", unique = true)
})
public class Payment {

    public static final String STATUS_CREATED = "created";
    public static final String STATUS_SUCCEEDED = "succeeded";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_REFUNDED = "refunded";
    public static final String STATUS_PARTIALLY_REFUNDED = "partially_refunded";

    @Id
    public String id;

    @Indexed(unique = true)
    public String idempotencyKey;

    @Indexed
    public String orderId;

    @Indexed
    public String userId;

    public String provider;

    public String providerReference;

    public long amountCents;

    public String currency = "USD";

    public String status = STATUS_CREATED;

    public long refundedCents = 0;

    public List<PaymentRefund> refunds = new ArrayList<>();

    /** Gateway event ids already processed — replays are acknowledged but ignored. */
    public List<String> processedWebhookIds = new ArrayList<>();

    public Map<String, Object> metadata = new LinkedHashMap<>();

    public Instant createdAt;

    public Instant updatedAt;

    public static class PaymentRefund {
        public long amountCents;
        public String reason;
        public String refundReference;
        public Instant at;
    }
}
