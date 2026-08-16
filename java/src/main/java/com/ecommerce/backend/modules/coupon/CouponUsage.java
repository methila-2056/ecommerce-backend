package com.ecommerce.backend.modules.coupon;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Coupon redemption record (collection {@code couponusages}, mirrors {@code coupon-usage.model.ts}). */
@Document(collection = "couponusages")
@CompoundIndexes({
    @CompoundIndex(name = "coupon_user", def = "{'couponId':1,'userId':1}")
})
public class CouponUsage {

    @Id
    public String id;

    @Indexed
    public String couponId;

    public String userId;

    public String orderId;

    public long discountCents = 0;

    public Instant usedAt;

    public Instant createdAt;

    public Instant updatedAt;
}
