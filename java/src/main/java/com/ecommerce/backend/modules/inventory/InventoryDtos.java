package com.ecommerce.backend.modules.inventory;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request payloads for the inventory module (mirrors {@code inventory.validators.ts}). */
public final class InventoryDtos {

    private InventoryDtos() {}

    public record QuantityRequest(
            @NotNull(message = "Quantity is required")
            @Min(value = 1, message = "Quantity must be a positive integer")
            Integer quantity) {}

    public record RestockRequest(
            @NotNull(message = "Quantity is required")
            @Min(value = 1, message = "Quantity must be a positive integer")
            Integer quantity,
            @Size(max = 500, message = "Reason must be at most 500 characters")
            String reason) {}

    public record AdjustRequest(
            @NotNull(message = "Quantity is required")
            @Min(value = 0, message = "Quantity must be a non-negative integer")
            Integer quantity,
            @NotBlank(message = "A reason is required for adjustments")
            @Size(min = 1, max = 500, message = "Reason must be between 1 and 500 characters")
            String reason) {}
}
