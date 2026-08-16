package com.ecommerce.backend.modules.cart;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Shopping cart (collection {@code carts}, mirrors {@code cart.model.ts}). */
@Document(collection = "carts")
public class Cart {

    public static final int MAX_ITEM_QUANTITY = 99;

    @Id
    public String id;

    @Indexed(unique = true)
    public String userId;

    public List<CartItem> items = new ArrayList<>();

    public Instant createdAt;

    public Instant updatedAt;

    /** One cart line (references only; prices are re-read from products). */
    public static class CartItem {
        public String productId;
        public String variantId;
        public int quantity;
        public Instant addedAt;
    }
}
