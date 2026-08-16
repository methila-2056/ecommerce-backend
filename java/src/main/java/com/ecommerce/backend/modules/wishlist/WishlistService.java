package com.ecommerce.backend.modules.wishlist;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.Variant;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/** Wishlist logic (mirrors {@code wishlist.service.ts}). */
@Service
public class WishlistService {

    private final WishlistRepository wishlistRepository;
    private final MongoTemplate mongo;
    private final AuditService auditService;

    public WishlistService(
            WishlistRepository wishlistRepository, MongoTemplate mongo, AuditService auditService) {
        this.wishlistRepository = wishlistRepository;
        this.mongo = mongo;
        this.auditService = auditService;
    }

    // -------------------------------------------------------------- Public shapes

    public record WishlistItemPublic(
            String productId,
            String addedAt,
            WishlistProductPublic product) {}

    public record WishlistProductPublic(
            String id,
            String name,
            String slug,
            String image,
            Long priceCents,
            boolean inStock,
            boolean available) {}

    // ----------------------------------------------------------------- Reads

    public List<WishlistItemPublic> getWishlist(String userId) {
        Wishlist wishlist = wishlistRepository.findByUserId(userId).orElse(null);
        if (wishlist == null || wishlist.items.isEmpty()) {
            return List.of();
        }

        List<String> productIds = wishlist.items.stream().map(i -> i.productId).toList();
        List<Product> products = mongo.find(
                Query.query(Criteria.where("_id").in(productIds)), Product.class);
        Map<String, Product> byId = new java.util.LinkedHashMap<>();
        for (Product p : products) {
            byId.put(p.id, p);
        }

        List<WishlistItemPublic> result = new ArrayList<>();
        for (Wishlist.WishlistItem item : wishlist.items) {
            Product product = byId.get(item.productId);
            if (product == null) {
                result.add(new WishlistItemPublic(item.productId, iso(item.addedAt), null));
                continue;
            }
            List<Variant> activeVariants = product.variants.stream()
                    .filter(v -> v.isActive)
                    .toList();
            boolean inStock = activeVariants.stream().anyMatch(v -> v.available() > 0);
            List<Long> prices = activeVariants.stream()
                    .filter(v -> v.available() > 0)
                    .map(v -> v.priceCents)
                    .toList();
            boolean available = Product.STATUS_PUBLISHED.equals(product.status) && product.isActive;

            result.add(new WishlistItemPublic(
                    item.productId,
                    iso(item.addedAt),
                    new WishlistProductPublic(
                            product.id,
                            product.name,
                            product.slug,
                            product.images == null || product.images.isEmpty() ? null : product.images.get(0),
                            prices.isEmpty() ? null : prices.stream().mapToLong(Long::longValue).min().orElse(0),
                            inStock,
                            available)));
        }
        return result;
    }

    public boolean isInWishlist(String userId, String productId) {
        Wishlist wishlist = wishlistRepository.findByUserId(userId).orElse(null);
        if (wishlist == null) {
            return false;
        }
        return wishlist.items.stream().anyMatch(i -> productId.equals(i.productId));
    }

    // ---------------------------------------------------------------- Mutations

    public List<WishlistItemPublic> addToWishlist(String userId, String productId) {
        if (!ObjectId.isValid(productId) || !mongo.exists(
                Query.query(Criteria.where("_id").is(productId)), Product.class)) {
            throw ApiException.notFound("Product not found");
        }

        Wishlist wishlist = wishlistRepository.findByUserId(userId).orElse(null);
        boolean present = wishlist != null
                && wishlist.items.stream().anyMatch(i -> productId.equals(i.productId));
        if (!present) {
            if (wishlist == null) {
                wishlist = new Wishlist();
                wishlist.userId = userId;
                wishlist.items = new ArrayList<>();
                wishlist.createdAt = Instant.now();
            }
            Wishlist.WishlistItem item = new Wishlist.WishlistItem();
            item.productId = productId;
            item.addedAt = Instant.now();
            wishlist.items.add(item);
            wishlist.updatedAt = Instant.now();
            wishlistRepository.save(wishlist);
        }
        auditService.log("wishlist.item_added", userId, null, Map.of("productId", productId));
        return getWishlist(userId);
    }

    public List<WishlistItemPublic> removeFromWishlist(String userId, String productId) {
        wishlistRepository.findByUserId(userId).ifPresent(wishlist -> {
            wishlist.items.removeIf(i -> productId.equals(i.productId));
            wishlist.updatedAt = Instant.now();
            wishlistRepository.save(wishlist);
        });
        auditService.log("wishlist.item_removed", userId, null, Map.of("productId", productId));
        return getWishlist(userId);
    }

    public List<WishlistItemPublic> clearWishlist(String userId) {
        wishlistRepository.deleteByUserId(userId);
        return List.of();
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
