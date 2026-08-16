package com.ecommerce.backend.modules.payment;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.modules.payment.PaymentProvider.CreatePaymentInput;
import com.ecommerce.backend.modules.payment.PaymentProvider.CreatePaymentResult;
import com.ecommerce.backend.modules.payment.PaymentProvider.PaymentStatusResult;
import com.ecommerce.backend.modules.payment.PaymentProvider.RefundResult;
import com.ecommerce.backend.modules.payment.PaymentProvider.WebhookEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

/**
 * Mock gateway used in development and tests (mirrors
 * {@code mock.provider.ts}). Speaks the same contract as a real gateway but
 * settles instantly and lets every code path be exercised: auto-approve returns
 * {@code succeeded} immediately, otherwise the caller waits for a webhook (which
 * the dev-only /payments/mock/notify endpoint can emit). Webhook payloads are
 * HMAC-SHA256 signed exactly like a real gateway, so signature verification is
 * real code.
 */
@Component
public class MockPaymentProvider implements PaymentProvider {

    private static final Map<String, String> EVENTS_FOR_WEBHOOK_TYPE = Map.of(
            "payment.succeeded", "pay_succeeded",
            "payment.failed", "pay_failed",
            "refund.succeeded", "refund_succeeded");

    private static final Map<String, String> WEBHOOK_TYPE_TO_EVENT = Map.of(
            "pay_succeeded", "payment.succeeded",
            "pay_failed", "payment.failed",
            "refund_succeeded", "refund.succeeded");

    private final AppConfig config;
    private final ObjectMapper objectMapper;

    private final List<QueuedEvent> queuedEvents = new ArrayList<>();

    public MockPaymentProvider(AppConfig config, ObjectMapper objectMapper) {
        this.config = config;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public CreatePaymentResult createPayment(CreatePaymentInput input) {
        String providerReference = "mock_pay_" + uuidNoDashes();
        if (config.paymentMockAutoApprove()) {
            Map<String, Object> object = new LinkedHashMap<>();
            object.put("id", providerReference);
            object.put("amount_cents", input.amountCents());
            object.put("currency", input.currency());
            object.put("order_id", input.orderId());
            object.put("idempotency_key", input.idempotencyKey());

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("id", "wh_" + uuidNoDashes());
            body.put("type", "payment.succeeded");
            body.put("object", object);

            queue(body, providerReference, input.amountCents());

            Map<String, Object> raw = new LinkedHashMap<>();
            raw.put("auto_approved", true);
            return new CreatePaymentResult(providerReference, Payment.STATUS_SUCCEEDED, null, raw);
        }

        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("auto_approved", false);
        return new CreatePaymentResult(providerReference, Payment.STATUS_CREATED, null, raw);
    }

    @Override
    public PaymentStatusResult getPaymentStatus(String providerReference) {
        for (QueuedEvent queued : queuedEvents) {
            if (providerReference.equals(queued.providerReference)
                    && "payment.succeeded".equals(queued.body.get("type"))) {
                return new PaymentStatusResult(
                        Payment.STATUS_SUCCEEDED, 0, queued.body);
            }
        }
        Map<String, Object> raw = new LinkedHashMap<>();
        raw.put("providerReference", providerReference);
        return new PaymentStatusResult(Payment.STATUS_CREATED, 0, raw);
    }

    @Override
    public WebhookEvent verifyWebhook(byte[] rawBody, String signature) {
        byte[] expected = hmacSha256Hex(config.paymentWebhookSecret(), rawBody);
        byte[] provided;
        try {
            provided = hexToBytes(signature == null ? "" : signature);
        } catch (RuntimeException e) {
            provided = new byte[0];
        }
        if (provided.length != expected.length || !MessageDigest.isEqual(expected, provided)) {
            throw ApiException.unauthorized("Invalid webhook signature", "INVALID_WEBHOOK_SIGNATURE");
        }

        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(rawBody, Map.class);
        } catch (Exception e) {
            throw ApiException.badRequest("Malformed webhook payload", "MALFORMED_WEBHOOK");
        }

        Object typeValue = payload.get("type");
        Object webhookId = payload.get("id");
        Object objectValue = payload.get("object");
        String type = typeValue == null ? null : typeValue.toString();
        String id = webhookId == null ? null : webhookId.toString();
        Map<String, Object> object = null;
        if (objectValue instanceof Map) {
            object = (Map<String, Object>) objectValue;
        }
        if (type == null || type.isBlank() || id == null || object == null || object.get("id") == null) {
            throw ApiException.badRequest("Malformed webhook payload", "MALFORMED_WEBHOOK");
        }

        long amountCents = number(object.get("amount_cents"));
        String refundReference = payload.get("refund_reference") == null
                ? null
                : payload.get("refund_reference").toString();
        return new WebhookEvent(
                WEBHOOK_TYPE_TO_EVENT.getOrDefault(type, type),
                id,
                object.get("id").toString(),
                amountCents,
                stringOrNull(object.get("reason")),
                refundReference,
                payload);
    }

    @Override
    public RefundResult refundPayment(String providerReference, Long amountCents, String reason) {
        String refundReference = "mock_ref_" + uuidNoDashes();
        Map<String, Object> object = new LinkedHashMap<>();
        object.put("id", providerReference);
        object.put("amount_cents", amountCents == null ? 0 : amountCents);
        object.put("reason", reason);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "wh_" + uuidNoDashes());
        body.put("type", "refund.succeeded");
        body.put("object", object);
        body.put("refund_reference", refundReference);

        queue(body, providerReference, amountCents == null ? 0 : amountCents);
        return new RefundResult(refundReference, Payment.STATUS_REFUNDED);
    }

    /** Dev-only: builds a correctly-signed webhook payload for the given event. */
    public SignedWebhook buildSignedWebhook(
            String type, String providerReference, long amountCents, String reason) {
        Map<String, Object> object = new LinkedHashMap<>();
        object.put("id", providerReference);
        object.put("amount_cents", amountCents);
        object.put("reason", reason);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", "wh_" + uuidNoDashes());
        body.put("type", EVENTS_FOR_WEBHOOK_TYPE.getOrDefault(type, type));
        body.put("object", object);

        byte[] raw;
        try {
            raw = objectMapper.writeValueAsBytes(body);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialize mock webhook", e);
        }
        return new SignedWebhook(raw, hex(hmacSha256Hex(config.paymentWebhookSecret(), raw)));
    }

    public record SignedWebhook(byte[] body, String signature) {}

    private void queue(Map<String, Object> body, String providerReference, long amountCents) {
        queuedEvents.add(new QueuedEvent(body, providerReference, amountCents));
    }

    private record QueuedEvent(Map<String, Object> body, String providerReference, long amountCents) {}

    private static String uuidNoDashes() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private static String stringOrNull(Object value) {
        return value == null ? null : value.toString();
    }

    private static long number(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        if (value != null) {
            try {
                return Long.parseLong(value.toString());
            } catch (NumberFormatException e) {
                return 0;
            }
        }
        return 0;
    }

    private static byte[] hmacSha256Hex(String secret, byte[] data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC failure", e);
        }
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private static byte[] hexToBytes(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }
}
