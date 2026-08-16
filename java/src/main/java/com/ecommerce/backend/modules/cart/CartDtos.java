package com.ecommerce.backend.modules.cart;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

/** Request payloads for the cart module (mirrors {@code cart.validators.ts}). */
public final class CartDtos {

    private CartDtos() {}

    public record AddItemRequest(
            @NotNull(message = "Product is required")
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String productId,
            @NotNull(message = "Variant is required")
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String variantId,
            @NotNull(message = "Quantity is required")
            @Min(value = 1, message = "Quantity must be at least 1")
            @Max(value = 99, message = "Quantity must be at most 99")
            Integer quantity) {}

    public record UpdateQuantityRequest(
            @NotNull(message = "Quantity is required")
            @Min(value = 1, message = "Quantity must be at least 1")
            @Max(value = 99, message = "Quantity must be at most 99")
            Integer quantity) {}
}
