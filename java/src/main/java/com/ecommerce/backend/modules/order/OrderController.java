package com.ecommerce.backend.modules.order;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.order.OrderDtos.CancelOrderRequest;
import com.ecommerce.backend.modules.order.OrderDtos.CreateOrderRequest;
import com.ecommerce.backend.modules.order.OrderDtos.RefundRequest;
import com.ecommerce.backend.modules.order.OrderDtos.TransitionRequest;
import com.ecommerce.backend.modules.order.OrderService.OrderListResult;
import com.ecommerce.backend.modules.order.OrderService.OrderPublic;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Order endpoints (mirrors {@code order.routes.ts} + {@code order.controller.ts}). */
@RestController
@RequestMapping("/api/v1/orders")
@Validated
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    // -------------------------------------------------------------- Admin / support

    @GetMapping("/admin")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<List<OrderPublic>>> adminListOrders(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String userId,
            @RequestParam(required = false) String orderNumber,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        OrderListResult result = orderService.listAdminOrders(p, l, status, userId, orderNumber, from, to);
        return ResponseEntity.ok(
                ApiResponse.success(result.orders(), "Orders retrieved successfully", meta(p, l, result.total())));
    }

    @GetMapping("/admin/{orderId}")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<OrderPublic>> adminGetOrder(@PathVariable String orderId) {
        OrderPublic order = orderService.getOrderById(orderId, null);
        return ResponseEntity.ok(ApiResponse.success(order, "Order retrieved successfully"));
    }

    @PostMapping("/admin/{orderId}/transition")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<OrderPublic>> adminTransitionOrder(
            @PathVariable String orderId,
            @Valid @RequestBody TransitionRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        OrderPublic order = orderService.adminTransitionOrder(
                orderId, body.to(), body.note(), current.userId());
        return ResponseEntity.ok(ApiResponse.success(order, "Order status updated successfully"));
    }

    // -------------------------------------------------------------- Customer

    @PostMapping
    public ResponseEntity<ApiResponse<OrderPublic>> createOrder(
            @Valid @RequestBody CreateOrderRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        OrderPublic order = orderService.createOrder(current.userId(), body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(order, "Order created successfully"));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<OrderPublic>>> listMyOrders(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String status,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        OrderListResult result = orderService.listCustomerOrders(current.userId(), p, l, status);
        return ResponseEntity.ok(
                ApiResponse.success(result.orders(), "Orders retrieved successfully", meta(p, l, result.total())));
    }

    @PostMapping("/{orderId}/cancel")
    public ResponseEntity<ApiResponse<OrderPublic>> cancelOrder(
            @PathVariable String orderId,
            @Valid @RequestBody CancelOrderRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        OrderPublic order = orderService.cancelOrderByCustomer(orderId, current.userId(), body.reason());
        return ResponseEntity.ok(ApiResponse.success(order, "Order cancelled successfully"));
    }

    @PostMapping("/{orderId}/refund-request")
    public ResponseEntity<ApiResponse<OrderPublic>> requestRefund(
            @PathVariable String orderId,
            @Valid @RequestBody RefundRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        OrderPublic order = orderService.requestRefund(orderId, current.userId(), body.reason());
        return ResponseEntity.ok(ApiResponse.success(order, "Refund request submitted successfully"));
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<ApiResponse<OrderPublic>> getOrder(
            @PathVariable String orderId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        OrderPublic order = orderService.getOrderById(orderId, current.userId());
        return ResponseEntity.ok(ApiResponse.success(order, "Order retrieved successfully"));
    }

    private Map<String, Object> meta(int page, int limit, long total) {
        PageMeta m = PageMeta.of(page, limit, total);
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", m.page());
        metaMap.put("limit", m.limit());
        metaMap.put("total", m.total());
        metaMap.put("totalPages", m.totalPages());
        metaMap.put("hasNextPage", m.hasNextPage());
        metaMap.put("hasPreviousPage", m.hasPreviousPage());
        return metaMap;
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
