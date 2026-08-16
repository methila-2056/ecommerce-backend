package com.ecommerce.backend.modules.cart;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.cart.CartDtos.AddItemRequest;
import com.ecommerce.backend.modules.cart.CartDtos.UpdateQuantityRequest;
import com.ecommerce.backend.modules.cart.CartService.CartPublic;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Cart endpoints (mirrors {@code cart.routes.ts} + {@code cart.controller.ts}). */
@RestController
@RequestMapping("/api/v1/cart")
@Validated
public class CartController {

    private final CartService cartService;

    public CartController(CartService cartService) {
        this.cartService = cartService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<CartPublic>> getCart(@AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        return ResponseEntity.ok(ApiResponse.success(
                cartService.getCart(current.userId()), "Cart retrieved successfully"));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<CartPublic>> addItem(
            @Valid @RequestBody AddItemRequest req, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CartPublic cart = cartService.addItem(
                current.userId(), req.productId(), req.variantId(), req.quantity());
        return ResponseEntity.ok(ApiResponse.success(cart, "Item added to cart successfully"));
    }

    @PatchMapping("/items/{variantId}")
    public ResponseEntity<ApiResponse<CartPublic>> updateQuantity(
            @PathVariable String variantId,
            @Valid @RequestBody UpdateQuantityRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CartPublic cart = cartService.updateItemQuantity(current.userId(), variantId, req.quantity());
        return ResponseEntity.ok(ApiResponse.success(cart, "Cart updated successfully"));
    }

    @DeleteMapping("/items/{variantId}")
    public ResponseEntity<ApiResponse<CartPublic>> removeItem(
            @PathVariable String variantId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CartPublic cart = cartService.removeItem(current.userId(), variantId);
        return ResponseEntity.ok(ApiResponse.success(cart, "Item removed from cart"));
    }

    @DeleteMapping
    public ResponseEntity<ApiResponse<CartPublic>> clearCart(@AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CartPublic cart = cartService.clearCart(current.userId());
        return ResponseEntity.ok(ApiResponse.success(cart, "Cart cleared"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
