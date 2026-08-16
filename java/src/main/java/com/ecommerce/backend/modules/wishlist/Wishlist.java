package com.ecommerce.backend.modules.wishlist;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Wishlist (collection {@code wishlists}, mirrors {@code wishlist.model.ts}). */
@Document(collection = "wishlists")
public class Wishlist {

    @Id
    public String id;

    @Indexed(unique = true)
    public String userId;

    public List<WishlistItem> items = new ArrayList<>();

    public Instant createdAt;

    public Instant updatedAt;

    public static class WishlistItem {
        public String productId;
        public Instant addedAt;
    }
}
