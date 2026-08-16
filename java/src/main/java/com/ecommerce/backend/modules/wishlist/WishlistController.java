package com.ecommerce.backend.modules.wishlist;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.wishlist.WishlistService.WishlistItemPublic;
import com.ecommerce.backend.security.CurrentUser;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Wishlist endpoints (mirrors {@code wishlist.routes.ts} + {@code wishlist.controller.ts}). */
@RestController
@RequestMapping("/api/v1/wishlist")
@Validated
public class WishlistController {

    private final WishlistService wishlistService;

    public WishlistController(WishlistService wishlistService) {
        this.wishlistService = wishlistService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<WishlistItemPublic>>> getWishlist(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        return ResponseEntity.ok(
                ApiResponse.success(wishlistService.getWishlist(current.userId()), "Wishlist retrieved successfully"));
    }

    @PostMapping("/{productId}")
    public ResponseEntity<ApiResponse<List<WishlistItemPublic>>> addToWishlist(
            @PathVariable String productId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        List<WishlistItemPublic> wishlist = wishlistService.addToWishlist(current.userId(), productId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(wishlist, "Item added to wishlist"));
    }

    @DeleteMapping("/{productId}")
    public ResponseEntity<ApiResponse<List<WishlistItemPublic>>> removeFromWishlist(
            @PathVariable String productId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        List<WishlistItemPublic> wishlist = wishlistService.removeFromWishlist(current.userId(), productId);
        return ResponseEntity.ok(ApiResponse.success(wishlist, "Item removed from wishlist"));
    }

    @DeleteMapping
    public ResponseEntity<ApiResponse<List<WishlistItemPublic>>> clearWishlist(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        List<WishlistItemPublic> wishlist = wishlistService.clearWishlist(current.userId());
        return ResponseEntity.ok(ApiResponse.success(wishlist, "Wishlist cleared successfully"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
