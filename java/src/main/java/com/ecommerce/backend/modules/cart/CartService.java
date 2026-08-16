package com.ecommerce.backend.modules.cart;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.Variant;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/**
 * Cart business logic (mirrors {@code cart.service.ts}). The cart stores only
 * references and quantities — every price is re-read from the product document
 * at read time and the order module re-derives totals from the database at
 * checkout; client-supplied prices are never trusted.
 */
@Service
public class CartService {

    private final CartRepository cartRepository;
    private final MongoTemplate mongo;
    private final AuditService auditService;

    public CartService(CartRepository cartRepository, MongoTemplate mongo, AuditService auditService) {
        this.cartRepository = cartRepository;
        this.mongo = mongo;
        this.auditService = auditService;
    }

    // ------------------------------------------------------------- Public shape

    public record CartItemPublic(
            String productId,
            String variantId,
            String sku,
            String productName,
            String productSlug,
            String image,
            Map<String, String> attributes,
            long unitPriceCents,
            Long compareAtPriceCents,
            double taxRate,
            int quantity,
            long available,
            long lineTotalCents,
            boolean inStock,
            boolean productAvailable) {}

    public record CartPublic(List<CartItemPublic> items, int itemCount, long subtotalCents) {}

    // -------------------------------------------------------------- Operations

    public CartPublic getCart(String userId) {
        Cart cart = getOrCreateCart(userId);
        return enrichCart(cart.items);
    }

    public CartPublic addItem(String userId, String productId, String variantId, int quantity) {
        resolveVariant(productId, variantId);

        Cart cart = getOrCreateCart(userId);
        Cart.CartItem existing = findItem(cart, variantId);
        int newQuantity = (existing == null ? 0 : existing.quantity) + quantity;

        if (newQuantity > Cart.MAX_ITEM_QUANTITY) {
            throw ApiException.badRequest(
                    "Maximum of " + Cart.MAX_ITEM_QUANTITY + " units per item",
                    "QUANTITY_LIMIT_EXCEEDED");
        }

        int availability = checkAvailability(productId, variantId);
        if (newQuantity > availability) {
            throw ApiException.badRequest(
                    "Only " + availability + " units are currently available", "INSUFFICIENT_STOCK");
        }

        if (existing != null) {
            existing.quantity = newQuantity;
        } else {
            Cart.CartItem item = new Cart.CartItem();
            item.productId = productId;
            item.variantId = variantId;
            item.quantity = quantity;
            item.addedAt = Instant.now();
            cart.items.add(item);
        }
        save(cart);
        auditService.log("cart.item_added", userId, null,
                Map.of("productId", productId, "variantId", variantId, "quantity", quantity));
        return enrichCart(cart.items);
    }

    public CartPublic updateItemQuantity(String userId, String variantId, int quantity) {
        Cart cart = getOrCreateCart(userId);
        Cart.CartItem item = findItem(cart, variantId);
        if (item == null) {
            throw ApiException.notFound("Item not found in cart");
        }

        if (quantity > Cart.MAX_ITEM_QUANTITY) {
            throw ApiException.badRequest(
                    "Maximum of " + Cart.MAX_ITEM_QUANTITY + " units per item",
                    "QUANTITY_LIMIT_EXCEEDED");
        }

        int availability = checkAvailability(item.productId, variantId);
        if (quantity > availability) {
            throw ApiException.badRequest(
                    "Only " + availability + " units are currently available", "INSUFFICIENT_STOCK");
        }

        item.quantity = quantity;
        save(cart);
        auditService.log("cart.item_updated", userId, null,
                Map.of("variantId", variantId, "quantity", quantity));
        return enrichCart(cart.items);
    }

    public CartPublic removeItem(String userId, String variantId) {
        Cart cart = getOrCreateCart(userId);
        int before = cart.items.size();
        cart.items.removeIf(i -> variantId.equals(i.variantId));
        if (cart.items.size() == before) {
            throw ApiException.notFound("Item not found in cart");
        }
        save(cart);
        auditService.log("cart.item_removed", userId, null, Map.of("variantId", variantId));
        return enrichCart(cart.items);
    }

    public CartPublic clearCart(String userId) {
        Cart cart = getOrCreateCart(userId);
        cart.items = new ArrayList<>();
        save(cart);
        auditService.log("cart.cleared", userId, null, Map.of());
        return new CartPublic(List.of(), 0, 0);
    }

    // ------------------------------------------------------------- Internals

    public int checkAvailability(String productId, String variantId) {
        Resolved resolved = resolveVariant(productId, variantId);
        return Math.toIntExact(resolved.variant().available());
    }

    private Cart getOrCreateCart(String userId) {
        return cartRepository.findByUserId(userId).orElseGet(() -> {
            Cart cart = new Cart();
            cart.userId = userId;
            cart.items = new ArrayList<>();
            cart.createdAt = Instant.now();
            cart.updatedAt = cart.createdAt;
            return cartRepository.save(cart);
        });
    }

    private void save(Cart cart) {
        cart.updatedAt = Instant.now();
        cartRepository.save(cart);
    }

    private Cart.CartItem findItem(Cart cart, String variantId) {
        for (Cart.CartItem item : cart.items) {
            if (variantId.equals(item.variantId)) {
                return item;
            }
        }
        return null;
    }

    private record Resolved(Product product, Variant variant) {}

    private Resolved resolveVariant(String productId, String variantId) {
        if (!ObjectId.isValid(productId) || !ObjectId.isValid(variantId)) {
            throw ApiException.badRequest("Product variant does not exist", "VARIANT_NOT_FOUND");
        }
        Product product = mongo.findOne(
                Query.query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                Product.class);
        if (product == null) {
            throw ApiException.badRequest("Product variant does not exist", "VARIANT_NOT_FOUND");
        }
        if (!Product.STATUS_PUBLISHED.equals(product.status) || !product.isActive) {
            throw ApiException.badRequest(
                    "This product is not available for purchase", "PRODUCT_UNAVAILABLE");
        }
        Variant variant = findVariant(product, variantId);
        if (variant == null) {
            throw ApiException.badRequest("Product variant does not exist", "VARIANT_NOT_FOUND");
        }
        if (!variant.isActive) {
            throw ApiException.badRequest("This variant is not available", "VARIANT_UNAVAILABLE");
        }
        return new Resolved(product, variant);
    }

    private Variant findVariant(Product product, String variantId) {
        for (Variant variant : product.variants) {
            if (variantId.equals(variant.id)) {
                return variant;
            }
        }
        return null;
    }

    private CartPublic enrichCart(List<Cart.CartItem> items) {
        if (items.isEmpty()) {
            return new CartPublic(List.of(), 0, 0);
        }
        List<String> variantIds = items.stream().map(i -> i.variantId).toList();
        List<Product> products = mongo.find(
                Query.query(Criteria.where("variants._id").in(variantIds)), Product.class);

        List<CartItemPublic> publicItems = new ArrayList<>();
        long subtotalCents = 0;

        for (Cart.CartItem item : items) {
            Product product = products.stream()
                    .filter(p -> p.variants.stream().anyMatch(v -> item.variantId.equals(v.id)))
                    .findFirst()
                    .orElse(null);
            Variant variant = product == null ? null : findVariant(product, item.variantId);

            if (product == null || variant == null) {
                publicItems.add(new CartItemPublic(
                        item.productId,
                        item.variantId,
                        "",
                        "Unavailable product",
                        "",
                        null,
                        Map.of(),
                        0,
                        null,
                        0,
                        item.quantity,
                        0,
                        0,
                        false,
                        false));
                continue;
            }

            long unitPriceCents = variant.priceCents;
            long lineTotalCents = unitPriceCents * item.quantity;
            subtotalCents += lineTotalCents;

            String image = firstOf(product.images, variant.images);
            boolean productAvailable = Product.STATUS_PUBLISHED.equals(product.status)
                    && product.isActive
                    && variant.isActive;
            publicItems.add(new CartItemPublic(
                    item.productId,
                    item.variantId,
                    variant.sku,
                    product.name,
                    product.slug,
                    image,
                    variant.attributes == null ? new LinkedHashMap<>() : variant.attributes,
                    unitPriceCents,
                    variant.compareAtPriceCents,
                    variant.taxRate,
                    item.quantity,
                    variant.available(),
                    lineTotalCents,
                    variant.available() > 0,
                    productAvailable));
        }

        int itemCount = items.stream().mapToInt(i -> i.quantity).sum();
        return new CartPublic(publicItems, itemCount, subtotalCents);
    }

    private static String firstOf(List<String> first, List<String> second) {
        if (first != null && !first.isEmpty()) {
            return first.get(0);
        }
        if (second != null && !second.isEmpty()) {
            return second.get(0);
        }
        return null;
    }
}
