package com.ecommerce.backend.modules.payment;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.modules.payment.PaymentDtos.CheckoutRequest;
import com.ecommerce.backend.modules.payment.PaymentDtos.MockNotifyRequest;
import com.ecommerce.backend.modules.payment.PaymentDtos.RefundRequest;
import com.ecommerce.backend.modules.payment.PaymentProvider.Registry;
import com.ecommerce.backend.modules.payment.PaymentService.CheckoutResult;
import com.ecommerce.backend.modules.payment.PaymentService.PaymentPublic;
import com.ecommerce.backend.modules.payment.PaymentService.WebhookResult;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Payment endpoints (mirrors {@code payment.routes.ts}, {@code payment.controller.ts}
 * and {@code payment.webhook.ts}). The webhook route consumes the raw request
 * body so HMAC verification runs over the exact bytes the gateway signed.
 */
@RestController
@RequestMapping("/api/v1/payments")
@Validated
public class PaymentController {

    private final PaymentService paymentService;
    private final Registry providerRegistry;
    private final AppConfig config;

    public PaymentController(
            PaymentService paymentService, Registry providerRegistry, AppConfig config) {
        this.paymentService = paymentService;
        this.providerRegistry = providerRegistry;
        this.config = config;
    }

    @PostMapping("/checkout")
    public ResponseEntity<ApiResponse<CheckoutResult>> createCheckout(
            @Valid @RequestBody CheckoutRequest body, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        CheckoutResult result = paymentService.createCheckout(body.orderId(), current.userId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(result, "Checkout created successfully"));
    }

    @PostMapping("/mock/notify")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<WebhookResult>> mockNotify(
            @Valid @RequestBody MockNotifyRequest body, @AuthenticationPrincipal CurrentUser user) {
        requireUser(user);
        if (config.isProduction()) {
            throw ApiException.forbidden(
                    "Mock webhook endpoint is disabled in production", "FORBIDDEN");
        }
        MockPaymentProvider provider = (MockPaymentProvider) providerRegistry.get("mock");
        MockPaymentProvider.SignedWebhook signed = provider.buildSignedWebhook(
                body.type(), body.providerReference(), body.amountCents(), body.reason());
        WebhookResult result = paymentService.processWebhook("mock", signed.body(), signed.signature());
        return ResponseEntity.ok(ApiResponse.success(result, "Mock webhook delivered"));
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<ApiResponse<PaymentPublic>> getPayment(
            @PathVariable String orderId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        boolean isStaff = current.roles().stream()
                .anyMatch(r -> "ADMIN".equals(r.name()) || "SUPPORT".equals(r.name()));
        PaymentPublic payment = paymentService.getPaymentByOrder(
                orderId, isStaff ? null : current.userId());
        return ResponseEntity.ok(ApiResponse.success(payment, "Payment retrieved successfully"));
    }

    @PostMapping("/{orderId}/refund")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<PaymentPublic>> refundOrder(
            @PathVariable String orderId,
            @Valid @RequestBody RefundRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        PaymentPublic payment = paymentService.refundOrder(
                orderId, body.amountCents(), body.reason(), current.userId());
        return ResponseEntity.ok(ApiResponse.success(payment, "Refund processed successfully"));
    }

    @PostMapping(value = "/webhook/{provider}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> webhook(
            @PathVariable String provider,
            @RequestHeader(value = "x-webhook-signature", required = false) String signature,
            @RequestBody byte[] rawBody) {
        WebhookResult result = paymentService.processWebhook(
                provider, rawBody, signature == null ? "" : signature);
        Map<String, Object> response = new java.util.LinkedHashMap<>();
        response.put("success", true);
        response.put("acknowledged", result.acknowledged());
        response.put("handled", result.handled());
        response.put("duplicate", result.duplicate());
        return ResponseEntity.ok(response);
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
