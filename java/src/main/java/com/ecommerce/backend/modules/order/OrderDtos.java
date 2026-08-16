package com.ecommerce.backend.modules.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request payloads for the order module (mirrors {@code order.validators.ts}). */
public final class OrderDtos {

    private OrderDtos() {}

    public record CreateOrderRequest(
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String shippingAddressId,
            @Valid ShippingAddressInput shippingAddress,
            @Size(min = 1, max = 50, message = "Coupon code must be between 1 and 50 characters")
            String couponCode) {}

    public record ShippingAddressInput(
            @jakarta.validation.constraints.NotBlank(message = "Full name is required")
            @Size(min = 1, max = 100, message = "Full name must be between 1 and 100 characters")
            String fullName,
            @jakarta.validation.constraints.NotBlank(message = "Phone is required")
            @Size(min = 1, max = 30, message = "Phone must be between 1 and 30 characters")
            String phone,
            @jakarta.validation.constraints.NotBlank(message = "Address line 1 is required")
            @Size(min = 1, max = 200, message = "Address line 1 must be between 1 and 200 characters")
            String line1,
            @Size(max = 200, message = "Address line 2 must be at most 200 characters")
            String line2,
            @jakarta.validation.constraints.NotBlank(message = "City is required")
            @Size(min = 1, max = 100, message = "City must be between 1 and 100 characters")
            String city,
            @jakarta.validation.constraints.NotBlank(message = "State is required")
            @Size(min = 1, max = 100, message = "State must be between 1 and 100 characters")
            String state,
            @jakarta.validation.constraints.NotBlank(message = "Postal code is required")
            @Size(min = 1, max = 20, message = "Postal code must be between 1 and 20 characters")
            String postalCode,
            @jakarta.validation.constraints.NotBlank(message = "Country is required")
            @Pattern(regexp = "^[A-Za-z]{2}$", message = "Country must be an ISO 3166-1 alpha-2 code")
            String country) {}

    public record TransitionRequest(
            @jakarta.validation.constraints.NotBlank(message = "Target status is required")
            @Pattern(regexp = "^(pending|confirmed|processing|packed|shipped|delivered|cancelled|refund_requested|refunded)$",
                    message = "Invalid order status")
            String to,
            @Size(max = 500, message = "Note must be at most 500 characters")
            String note) {}

    public record CancelOrderRequest(
            @Size(max = 500, message = "Reason must be at most 500 characters")
            String reason) {}

    public record RefundRequest(
            @jakarta.validation.constraints.NotBlank(message = "A reason is required")
            @Size(min = 1, max = 1000, message = "Reason must be between 1 and 1000 characters")
            String reason) {}
}
