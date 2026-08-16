package com.ecommerce.backend.modules.coupon;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Request payloads for the coupon module (mirrors {@code coupon.validators.ts}). */
public final class CouponDtos {

    private CouponDtos() {}

    public record CouponInput(
            @NotBlank(message = "Code is required")
            @Size(min = 1, max = 50, message = "Code must be between 1 and 50 characters")
            String code,
            @NotBlank(message = "Type is required")
            @Pattern(regexp = "^(percentage|fixed)$", message = "Invalid coupon type")
            String type,
            @Min(value = 1, message = "Discount value must be at least 1")
            Long value,
            @Pattern(regexp = "^(all|category|product)$", message = "Invalid coupon scope")
            String scope,
            @Size(max = 100, message = "A coupon can reference at most 100 products")
            List<@Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format") String> productIds,
            @Size(max = 100, message = "A coupon can reference at most 100 categories")
            List<@Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format") String> categoryIds,
            @Min(value = 0, message = "Minimum order value must be a non-negative integer")
            Long minOrderValueCents,
            @Min(value = 0, message = "Maximum discount must be a non-negative integer")
            Long maxDiscountCents,
            @Min(value = 1, message = "Max uses must be at least 1")
            Long maxUses,
            @Min(value = 1, message = "Per-user limit must be at least 1")
            Integer perUserLimit,
            String validFrom,
            String validUntil,
            Boolean isActive) {}

    public record CouponUpdate(
            @Size(min = 1, max = 50, message = "Code must be between 1 and 50 characters")
            String code,
            @Pattern(regexp = "^(percentage|fixed)$", message = "Invalid coupon type")
            String type,
            @Min(value = 1, message = "Discount value must be at least 1")
            Long value,
            @Pattern(regexp = "^(all|category|product)$", message = "Invalid coupon scope")
            String scope,
            @Size(max = 100, message = "A coupon can reference at most 100 products")
            List<@Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format") String> productIds,
            @Size(max = 100, message = "A coupon can reference at most 100 categories")
            List<@Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format") String> categoryIds,
            @Min(value = 0, message = "Minimum order value must be a non-negative integer")
            Long minOrderValueCents,
            @Min(value = 0, message = "Maximum discount must be a non-negative integer")
            Long maxDiscountCents,
            @Min(value = 1, message = "Max uses must be at least 1")
            Long maxUses,
            @Min(value = 1, message = "Per-user limit must be at least 1")
            Integer perUserLimit,
            String validFrom,
            String validUntil,
            Boolean isActive) {}

    public record ValidateCouponRequest(
            List<ValidateItem> items) {

        public record ValidateItem(
                @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
                String productId,
                @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
                String category,
                @Min(value = 0, message = "Unit price must be a non-negative integer")
                Long unitPriceCents,
                @Min(value = 1, message = "Quantity must be at least 1")
                Integer quantity) {}
    }
}
