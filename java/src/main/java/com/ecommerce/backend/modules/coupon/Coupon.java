package com.ecommerce.backend.modules.coupon;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Coupon (collection {@code coupons}, mirrors {@code coupon.model.ts}). */
@Document(collection = "coupons")
public class Coupon {

    public static final String TYPE_PERCENTAGE = "percentage";
    public static final String TYPE_FIXED = "fixed";

    public static final String SCOPE_ALL = "all";
    public static final String SCOPE_CATEGORY = "category";
    public static final String SCOPE_PRODUCT = "product";

    @Id
    public String id;

    @Indexed(unique = true)
    public String code;

    public String type;

    public long value;

    public String scope = SCOPE_ALL;

    public List<String> productIds = new ArrayList<>();

    public List<String> categoryIds = new ArrayList<>();

    public long minOrderValueCents = 0;

    public Long maxDiscountCents;

    public Long maxUses;

    public int perUserLimit = 1;

    public long usedCount = 0;

    public Instant validFrom;

    public Instant validUntil;

    public boolean isActive = true;

    public Instant createdAt;

    public Instant updatedAt;
}
