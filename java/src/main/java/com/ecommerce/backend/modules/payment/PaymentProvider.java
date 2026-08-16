package com.ecommerce.backend.modules.payment;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The seam between the checkout flow and a real gateway (mirrors
 * {@code payment.provider.ts}). Amounts are integer cents; currency is ISO 4217.
 * {@code verifyWebhook} MUST authenticate the payload and fail closed on any
 * signature/format problem, because the payment service relies on it to reject
 * forged callbacks.
 */
public interface PaymentProvider {

    String name();

    CreatePaymentResult createPayment(CreatePaymentInput input);

    PaymentStatusResult getPaymentStatus(String providerReference);

    WebhookEvent verifyWebhook(byte[] rawBody, String signature);

    RefundResult refundPayment(String providerReference, Long amountCents, String reason);

    record CreatePaymentInput(
            String idempotencyKey,
            String orderId,
            Customer customer,
            long amountCents,
            String currency) {}

    record Customer(String id, String email, String name) {}

    record CreatePaymentResult(
            String providerReference, String status, String checkoutUrl, Map<String, Object> raw) {}

    record PaymentStatusResult(String status, long refundedCents, Map<String, Object> raw) {}

    record RefundResult(String refundReference, String status) {}

    record WebhookEvent(
            String type,
            String webhookId,
            String providerReference,
            long amountCents,
            String reason,
            String refundReference,
            Map<String, Object> raw) {}

    /** Spring-managed registry keyed by provider name (mirrors the TS Map registry). */
    @org.springframework.stereotype.Component
    class Registry {

        private final Map<String, PaymentProvider> byName = new LinkedHashMap<>();

        public Registry(List<PaymentProvider> providers) {
            for (PaymentProvider provider : providers) {
                byName.put(provider.name(), provider);
            }
        }

        public void register(PaymentProvider provider) {
            byName.put(provider.name(), provider);
        }

        public PaymentProvider get(String name) {
            PaymentProvider provider = byName.get(name);
            if (provider == null) {
                throw new IllegalArgumentException(
                        "No payment provider registered under \"" + name + "\"");
            }
            return provider;
        }
    }
}
