package com.ecommerce.backend.modules.payment;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request payloads for the payment module (mirrors {@code payment.validators.ts}). */
public final class PaymentDtos {

    private PaymentDtos() {}

    public record CheckoutRequest(
            @NotBlank(message = "Order id is required")
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String orderId) {}

    public record RefundRequest(
            @Min(value = 1, message = "Amount must be at least 1 cent")
            Integer amountCents,
            @Size(max = 1000, message = "Reason must be at most 1000 characters")
            String reason) {}

    public record MockNotifyRequest(
            @NotBlank(message = "Event type is required")
            @Pattern(regexp = "^(payment\\.succeeded|payment\\.failed|refund\\.succeeded)$",
                    message = "Unsupported webhook event type")
            String type,
            @NotBlank(message = "Provider reference is required")
            String providerReference,
            @Min(value = 1, message = "Amount must be at least 1 cent")
            long amountCents,
            @Size(max = 1000, message = "Reason must be at most 1000 characters")
            String reason) {}
}
