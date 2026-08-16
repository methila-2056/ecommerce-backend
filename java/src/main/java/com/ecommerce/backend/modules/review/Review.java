package com.ecommerce.backend.modules.review;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Product review (collection {@code reviews}, mirrors {@code review.model.ts}). */
@Document(collection = "reviews")
@CompoundIndexes({
    @CompoundIndex(name = "product_user", def = "{'productId':1,'userId':1}", unique = true),
    @CompoundIndex(name = "status_product_created", def = "{'status':1,'productId':1,'createdAt':-1}")
})
public class Review {

    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_APPROVED = "approved";
    public static final String STATUS_REJECTED = "rejected";

    public static final int MIN_RATING = 1;
    public static final int MAX_RATING = 5;

    @Id
    public String id;

    @Indexed
    public String productId;

    @Indexed
    public String userId;

    /** Set when the reviewer's order for this product is delivered. */
    public String orderId;

    public int rating;

    public String title = "";

    public String body;

    public boolean isVerifiedPurchase = false;

    public String status = STATUS_PENDING;

    public String moderationReason;

    public Instant createdAt;

    public Instant updatedAt;
}
