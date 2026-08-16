package com.ecommerce.backend.modules.payment;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.order.Order;
import com.ecommerce.backend.modules.order.OrderRepository;
import com.ecommerce.backend.modules.order.OrderService;
import com.ecommerce.backend.modules.payment.Payment.PaymentRefund;
import com.ecommerce.backend.modules.payment.PaymentProvider.Registry;
import com.ecommerce.backend.modules.payment.PaymentProvider.WebhookEvent;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/**
 * Checkout + webhook handling (mirrors {@code payment.service.ts}). All side
 * effects flow through the event handler below — the single place order and
 * payment state change together. Replays of gateway events are acknowledged but
 * ignored via {@code processedWebhookIds}.
 */
@Service
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final Registry providerRegistry;
    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final UserRepository userRepository;
    private final AuditService auditService;
    private final AppConfig config;

    public PaymentService(
            PaymentRepository paymentRepository,
            Registry providerRegistry,
            OrderRepository orderRepository,
            OrderService orderService,
            UserRepository userRepository,
            AuditService auditService,
            AppConfig config) {
        this.paymentRepository = paymentRepository;
        this.providerRegistry = providerRegistry;
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.userRepository = userRepository;
        this.auditService = auditService;
        this.config = config;
    }

    // -------------------------------------------------------------- Public shapes

    public record PaymentRefundPublic(
            long amountCents, String reason, String refundReference, String at) {}

    public record PaymentPublic(
            String id,
            String orderId,
            String userId,
            String provider,
            String providerReference,
            long amountCents,
            String currency,
            String status,
            long refundedCents,
            List<PaymentRefundPublic> refunds,
            String createdAt,
            String updatedAt) {}

    public record CheckoutResult(PaymentPublic payment, OrderService.OrderPublic order) {}

    public record WebhookResult(boolean acknowledged, boolean handled, boolean duplicate) {}

    // --------------------------------------------------------------- Checkout

    public CheckoutResult createCheckout(String orderId, String userId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        if (!userId.equals(order.userId)) {
            throw ApiException.notFound("Order not found");
        }
        if (!Order.STATUS_PENDING.equals(order.status)) {
            throw ApiException.conflict("Only pending orders can be checked out", "ORDER_NOT_PAYABLE");
        }
        if (Order.PAYMENT_FAILED.equals(order.paymentStatus)) {
            orderService.prepareOrderForPayment(orderId);
        }

        Payment payment = paymentRepository
                .findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(
                        orderId, List.of(Payment.STATUS_CREATED))
                .orElse(null);
        if (payment == null) {
            User user = userRepository.findById(userId).orElse(null);
            PaymentProvider provider = providerRegistry.get(config.paymentProvider());
            String idempotencyKey = "ck_" + orderId + "_" + UUID.randomUUID();

            PaymentProvider.CreatePaymentResult result = provider.createPayment(
                    new PaymentProvider.CreatePaymentInput(
                            idempotencyKey,
                            orderId,
                            new PaymentProvider.Customer(userId, user == null ? "" : user.email, user == null ? "" : user.name),
                            order.totalCents,
                            order.currency));

            try {
                Payment created = new Payment();
                created.idempotencyKey = idempotencyKey;
                created.orderId = orderId;
                created.userId = userId;
                created.provider = provider.name();
                created.providerReference = result.providerReference();
                created.amountCents = order.totalCents;
                created.currency = order.currency;
                created.status = Payment.STATUS_CREATED;
                created.metadata = result.raw();
                created.createdAt = Instant.now();
                created.updatedAt = created.createdAt;
                payment = paymentRepository.insert(created);
            } catch (DuplicateKeyException e) {
                payment = paymentRepository
                        .findFirstByIdempotencyKeyOrderByCreatedAtDesc(idempotencyKey)
                        .orElseThrow(() -> ApiException.internal(
                                "Checkout conflict could not be resolved", "CHECKOUT_CONFLICT"));
            }

            if (Payment.STATUS_SUCCEEDED.equals(result.status())) {
                applyPaymentSucceeded(payment);
            }
        }

        // Re-read the order: auto-approval (or a retry after payment failure)
        // transitions it to confirmed, and the response must reflect that.
        Order refreshed = orderRepository.findById(orderId)
                .orElseThrow(() -> ApiException.notFound("Order not found"));
        return new CheckoutResult(toPaymentPublic(payment), orderService.toOrderPublic(refreshed));
    }

    // --------------------------------------------------------------- Webhook

    public WebhookResult processWebhook(String providerName, byte[] rawBody, String signature) {
        PaymentProvider provider;
        try {
            provider = providerRegistry.get(providerName);
        } catch (IllegalArgumentException e) {
            throw ApiException.badRequest(e.getMessage(), "UNKNOWN_PAYMENT_PROVIDER");
        }
        WebhookEvent event = provider.verifyWebhook(rawBody, signature);

        Payment payment = paymentRepository
                .findFirstByProviderAndProviderReference(providerName, event.providerReference())
                .orElse(null);
        if (payment == null) {
            auditService.log("payment.webhook_orphan", null, null, Map.of(
                    "providerReference", event.providerReference(),
                    "type", event.type()));
            return new WebhookResult(true, false, false);
        }

        if (!"refund.succeeded".equals(event.type()) && event.amountCents() != payment.amountCents) {
            throw ApiException.badRequest(
                    "Webhook amount does not match the stored payment", "WEBHOOK_AMOUNT_MISMATCH");
        }

        if (payment.processedWebhookIds.contains(event.webhookId())) {
            return new WebhookResult(true, false, true);
        }

        handleEvent(payment, event);
        return new WebhookResult(true, true, false);
    }

    private void handleEvent(Payment payment, WebhookEvent event) {
        payment.processedWebhookIds.add(event.webhookId());
        switch (event.type()) {
            case "payment.succeeded":
                if (!Payment.STATUS_SUCCEEDED.equals(payment.status)) {
                    applyPaymentSucceeded(payment);
                } else {
                    paymentRepository.save(payment);
                }
                break;
            case "payment.failed":
                if (Payment.STATUS_CREATED.equals(payment.status)) {
                    applyPaymentFailed(payment);
                } else {
                    paymentRepository.save(payment);
                }
                break;
            case "refund.succeeded":
                applyRefundSucceeded(
                        payment,
                        event.amountCents(),
                        event.reason() == null ? "" : event.reason(),
                        event.refundReference() == null ? "" : event.refundReference());
                break;
            default:
                throw ApiException.badRequest(
                        "Unsupported webhook event type", "UNSUPPORTED_WEBHOOK_EVENT");
        }
    }

    // ------------------------------------------------------------ Side effects

    private void applyPaymentSucceeded(Payment payment) {
        orderService.markOrderPaid(payment.orderId, payment.id);
        payment.status = Payment.STATUS_SUCCEEDED;
        payment.updatedAt = Instant.now();
        paymentRepository.save(payment);
        auditService.log("payment.succeeded", null, null, Map.of(
                "paymentId", payment.id, "orderId", payment.orderId));
    }

    private void applyPaymentFailed(Payment payment) {
        orderService.markOrderPaymentFailed(payment.orderId);
        payment.status = Payment.STATUS_FAILED;
        payment.updatedAt = Instant.now();
        paymentRepository.save(payment);
        auditService.log("payment.failed", null, null, Map.of(
                "paymentId", payment.id, "orderId", payment.orderId));
    }

    private void applyRefundSucceeded(
            Payment payment, long amountCents, String reason, String refundReference) {
        PaymentRefund refund = new PaymentRefund();
        refund.amountCents = amountCents;
        refund.reason = reason;
        refund.refundReference = refundReference;
        refund.at = Instant.now();
        payment.refunds.add(refund);
        payment.refundedCents += amountCents;
        payment.status = payment.refundedCents >= payment.amountCents
                ? Payment.STATUS_REFUNDED
                : Payment.STATUS_PARTIALLY_REFUNDED;
        payment.updatedAt = Instant.now();
        paymentRepository.save(payment);
        orderService.finalizeRefund(
                payment.orderId, amountCents, reason, refundReference, "system");
    }

    // --------------------------------------------------------------- Reads & refunds

    public PaymentPublic getPaymentByOrder(String orderId, String userId) {
        Payment payment = paymentRepository
                .findFirstByOrderIdOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (userId != null && !userId.equals(payment.userId)) {
            throw ApiException.notFound("Payment not found");
        }
        return toPaymentPublic(payment);
    }

    public PaymentPublic refundOrder(
            String orderId, Integer amountCents, String reason, String actorId) {
        Payment payment = paymentRepository
                .findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(
                        orderId,
                        List.of(Payment.STATUS_SUCCEEDED, Payment.STATUS_PARTIALLY_REFUNDED))
                .orElseThrow(() -> ApiException.notFound("No payable payment found for this order"));

        long refundAmount = amountCents == null
                ? payment.amountCents - payment.refundedCents
                : amountCents;
        if (refundAmount <= 0) {
            throw ApiException.badRequest("Refund amount must be positive", "BAD_REQUEST");
        }

        PaymentProvider provider = providerRegistry.get(payment.provider);
        PaymentProvider.RefundResult result = provider.refundPayment(
                payment.providerReference, refundAmount, reason);
        applyRefundSucceeded(payment, refundAmount, reason == null ? "" : reason, result.refundReference());

        auditService.log("payment.refund_processed", actorId, null, Map.of(
                "orderId", orderId, "amountCents", refundAmount));
        return toPaymentPublic(payment);
    }

    // -------------------------------------------------------------- Internals

    private PaymentPublic toPaymentPublic(Payment payment) {
        List<PaymentRefundPublic> refunds = payment.refunds.stream()
                .map(r -> new PaymentRefundPublic(
                        r.amountCents, r.reason, r.refundReference, iso(r.at)))
                .toList();
        return new PaymentPublic(
                payment.id,
                payment.orderId,
                payment.userId,
                payment.provider,
                payment.providerReference,
                payment.amountCents,
                payment.currency,
                payment.status,
                payment.refundedCents,
                refunds,
                iso(payment.createdAt),
                iso(payment.updatedAt));
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
