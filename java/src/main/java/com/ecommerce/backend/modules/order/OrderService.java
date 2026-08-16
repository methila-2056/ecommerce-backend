package com.ecommerce.backend.modules.order;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.cart.Cart;
import com.ecommerce.backend.modules.cart.CartRepository;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.Variant;
import com.ecommerce.backend.modules.coupon.Coupon;
import com.ecommerce.backend.modules.coupon.CouponRepository;
import com.ecommerce.backend.modules.coupon.CouponService;
import com.ecommerce.backend.modules.coupon.CouponUsage;
import com.ecommerce.backend.modules.coupon.CouponUsageRepository;
import com.ecommerce.backend.modules.inventory.InventoryService;
import com.ecommerce.backend.modules.inventory.InventoryService.MovementReference;
import com.ecommerce.backend.modules.notification.NotificationService;
import com.ecommerce.backend.modules.order.Order.OrderItem;
import com.ecommerce.backend.modules.order.Order.OrderRefund;
import com.ecommerce.backend.modules.order.Order.OrderStatusEvent;
import com.ecommerce.backend.modules.user.Address;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/**
 * Order lifecycle (mirrors {@code order.service.ts}). All money is integer
 * cents; order documents are immutable snapshots of what the customer paid for
 * at purchase time. The critical overselling guard is applied atomically inside
 * {@code InventoryService} (each reservation is a guarded findAndModify); the
 * multi-collection steps are ordered and compensated best-effort.
 */
@Service
public class OrderService {

    private static final Map<String, List<String>> ALLOWED_TRANSITIONS = Map.of(
            Order.STATUS_PENDING, List.of(Order.STATUS_CONFIRMED, Order.STATUS_CANCELLED),
            Order.STATUS_CONFIRMED, List.of(Order.STATUS_PROCESSING, Order.STATUS_CANCELLED, Order.STATUS_REFUND_REQUESTED),
            Order.STATUS_PROCESSING, List.of(Order.STATUS_PACKED, Order.STATUS_CANCELLED, Order.STATUS_REFUND_REQUESTED),
            Order.STATUS_PACKED, List.of(Order.STATUS_SHIPPED, Order.STATUS_CANCELLED),
            Order.STATUS_SHIPPED, List.of(Order.STATUS_DELIVERED),
            Order.STATUS_DELIVERED, List.of(Order.STATUS_REFUND_REQUESTED),
            Order.STATUS_REFUND_REQUESTED, List.of(Order.STATUS_REFUNDED, Order.STATUS_DELIVERED),
            Order.STATUS_REFUNDED, List.of(),
            Order.STATUS_CANCELLED, List.of());

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter ORD_DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);
    private static final Pattern OBJECT_ID = Pattern.compile("^[a-fA-F0-9]{24}$");

    private final OrderRepository orderRepository;
    private final CartRepository cartRepository;
    private final CouponRepository couponRepository;
    private final CouponUsageRepository couponUsageRepository;
    private final CouponService couponService;
    private final InventoryService inventoryService;
    private final NotificationService notificationService;
    private final UserRepository userRepository;
    private final MongoTemplate mongo;
    private final AuditService auditService;
    private final AppConfig config;

    public OrderService(
            OrderRepository orderRepository,
            CartRepository cartRepository,
            CouponRepository couponRepository,
            CouponUsageRepository couponUsageRepository,
            CouponService couponService,
            InventoryService inventoryService,
            NotificationService notificationService,
            UserRepository userRepository,
            MongoTemplate mongo,
            AuditService auditService,
            AppConfig config) {
        this.orderRepository = orderRepository;
        this.cartRepository = cartRepository;
        this.couponRepository = couponRepository;
        this.couponUsageRepository = couponUsageRepository;
        this.couponService = couponService;
        this.inventoryService = inventoryService;
        this.notificationService = notificationService;
        this.userRepository = userRepository;
        this.mongo = mongo;
        this.auditService = auditService;
        this.config = config;
    }

    // ------------------------------------------------------------- State machine

    private void assertTransition(String from, String to, String context) {
        if (from.equals(to)) {
            return;
        }
        if (!ALLOWED_TRANSITIONS.getOrDefault(from, List.of()).contains(to)) {
            throw ApiException.conflict(
                    "Cannot move an order from \"" + from + "\" to \"" + to + "\" (" + context + ")",
                    "INVALID_ORDER_TRANSITION");
        }
    }

    // -------------------------------------------------------------- Public shapes

    public record OrderItemPublic(
            String productId,
            String variantId,
            String sku,
            String name,
            String image,
            Map<String, String> attributes,
            long unitPriceCents,
            double taxRate,
            long taxAmountCents,
            long discountCents,
            long lineTotalCents,
            int quantity) {}

    public record ShippingAddressPublic(
            String fullName, String phone, String line1, String line2, String city,
            String state, String postalCode, String country) {}

    public record StatusEventPublic(String status, String note, String changedBy, String at) {}

    public record RefundPublic(
            long amountCents, String reason, String status, String paymentRefundId, String at) {}

    public record OrderPublic(
            String id,
            String orderNumber,
            String userId,
            List<OrderItemPublic> items,
            long subtotalCents,
            long discountTotalCents,
            String couponCode,
            long couponDiscountCents,
            long taxTotalCents,
            long shippingCents,
            long totalCents,
            String currency,
            ShippingAddressPublic shippingAddress,
            String status,
            List<StatusEventPublic> statusHistory,
            String paymentId,
            String paymentStatus,
            boolean stockDeducted,
            String placedAt,
            String cancelledAt,
            String cancelledReason,
            List<RefundPublic> refunds,
            String createdAt,
            String updatedAt) {}

    public OrderPublic toOrderPublic(Order order) {
        List<OrderItemPublic> items = order.items.stream()
                .map(i -> new OrderItemPublic(
                        i.productId, i.variantId, i.sku, i.name, i.image, i.attributes,
                        i.unitPriceCents, i.taxRate, i.taxAmountCents, i.discountCents,
                        i.lineTotalCents, i.quantity))
                .toList();
        List<StatusEventPublic> history = order.statusHistory.stream()
                .map(h -> new StatusEventPublic(h.status, h.note, h.changedBy, iso(h.at)))
                .toList();
        List<RefundPublic> refunds = order.refunds.stream()
                .map(r -> new RefundPublic(r.amountCents, r.reason, r.status, r.paymentRefundId, iso(r.at)))
                .toList();
        return new OrderPublic(
                order.id,
                order.orderNumber,
                order.userId,
                items,
                order.subtotalCents,
                order.discountTotalCents,
                order.couponCode,
                order.couponDiscountCents,
                order.taxTotalCents,
                order.shippingCents,
                order.totalCents,
                order.currency,
                shippingPublic(order.shippingAddress),
                order.status,
                history,
                order.paymentId,
                order.paymentStatus,
                order.stockDeducted,
                iso(order.placedAt),
                iso(order.cancelledAt),
                order.cancelledReason,
                refunds,
                iso(order.createdAt),
                iso(order.updatedAt));
    }

    private ShippingAddressPublic shippingPublic(Order.ShippingAddress a) {
        if (a == null) {
            return null;
        }
        return new ShippingAddressPublic(
                a.fullName, a.phone, a.line1, a.line2, a.city, a.state, a.postalCode, a.country);
    }

    // --------------------------------------------------------------- Checkout

    public OrderPublic createOrder(String userId, OrderDtos.CreateOrderRequest input) {
        Cart cart = cartRepository.findByUserId(userId).orElse(null);
        if (cart == null || cart.items.isEmpty()) {
            throw ApiException.badRequest("Cart is empty", "EMPTY_CART");
        }

        Order.ShippingAddress shippingAddress = resolveShippingAddress(userId, input);
        List<String> variantIds = cart.items.stream().map(i -> i.variantId).toList();
        List<Product> products = mongo.find(
                Query.query(Criteria.where("variants._id").in(variantIds)), Product.class);

        List<OrderItem> orderItems = new ArrayList<>();
        for (Cart.CartItem item : cart.items) {
            Product product = products.stream()
                    .filter(p -> p.variants.stream().anyMatch(v -> item.variantId.equals(v.id)))
                    .findFirst()
                    .orElse(null);
            Variant variant = product == null ? null : findVariant(product, item.variantId);

            if (product == null || variant == null) {
                throw ApiException.badRequest(
                        "An item in your cart is no longer available", "ITEM_UNAVAILABLE");
            }
            if (!Product.STATUS_PUBLISHED.equals(product.status) || !product.isActive || !variant.isActive) {
                throw ApiException.badRequest(
                        "\"" + product.name + "\" is no longer available", "ITEM_UNAVAILABLE");
            }

            OrderItem orderItem = new OrderItem();
            orderItem.productId = product.id;
            orderItem.variantId = item.variantId;
            orderItem.sku = variant.sku;
            orderItem.name = product.name;
            orderItem.image = firstOf(product.images, variant.images);
            orderItem.attributes = variant.attributes == null ? Map.of() : variant.attributes;
            orderItem.unitPriceCents = variant.priceCents;
            orderItem.taxRate = variant.taxRate;
            orderItem.quantity = item.quantity;
            orderItems.add(orderItem);
        }

        long subtotalCents = orderItems.stream()
                .mapToLong(i -> i.unitPriceCents * i.quantity)
                .sum();

        long couponDiscountCents = 0;
        String couponId = null;
        String couponCode = null;
        if (input.couponCode() != null && !input.couponCode().isBlank()) {
            CouponService.DiscountResult discount = couponService.computeDiscount(
                    input.couponCode(),
                    userId,
                    orderItems.stream()
                            .map(i -> {
                                Product p = products.stream()
                                        .filter(x -> x.id.equals(i.productId))
                                        .findFirst()
                                        .orElse(null);
                                return new CouponService.DiscountCartItem(
                                        i.productId, p == null ? null : p.category,
                                        i.unitPriceCents, i.quantity);
                            })
                            .toList());
            couponDiscountCents = discount.discountCents();
            couponId = discount.couponId();
            couponCode = discount.code();
        }

        if (couponDiscountCents > 0) {
            long allocated = 0;
            for (int i = 0; i < orderItems.size(); i++) {
                OrderItem item = orderItems.get(i);
                long share;
                if (i == orderItems.size() - 1) {
                    share = couponDiscountCents - allocated;
                } else {
                    share = Math.floorDiv(
                            (item.unitPriceCents * item.quantity) * couponDiscountCents, subtotalCents);
                }
                item.discountCents = share;
                allocated += share;
            }
        }

        long taxTotalCents = orderItems.stream()
                .mapToLong(i -> Math.round((i.unitPriceCents * i.quantity * i.taxRate) / 100.0))
                .sum();
        long shippingCents = subtotalCents >= config.freeShippingThresholdCents()
                ? 0
                : config.shippingFlatCents();
        long totalCents = Math.max(0, subtotalCents - couponDiscountCents + taxTotalCents + shippingCents);

        for (OrderItem item : orderItems) {
            item.taxAmountCents = Math.round((item.unitPriceCents * item.quantity * item.taxRate) / 100.0);
            item.lineTotalCents = item.unitPriceCents * item.quantity - item.discountCents;
        }

        String orderNumber = generateOrderNumber();

        // Reserve stock. The atomic guard prevents overselling; on a partial
        // failure the already-reserved quantities are released (compensation).
        List<String> reservedItems = new ArrayList<>();
        try {
            for (int i = 0; i < orderItems.size(); i++) {
                OrderItem item = orderItems.get(i);
                inventoryService.reserveStock(
                        item.productId, item.variantId, item.quantity,
                        "order " + orderNumber,
                        new MovementReference("order", orderNumber, null));
                reservedItems.add(String.valueOf(i));
            }
        } catch (RuntimeException e) {
            for (int i = 0; i < orderItems.size(); i++) {
                if (reservedItems.contains(String.valueOf(i))) {
                    OrderItem item = orderItems.get(i);
                    try {
                        inventoryService.releaseStock(
                                item.productId, item.variantId, item.quantity,
                                "order " + orderNumber + " rolled back",
                                new MovementReference("order", orderNumber, null));
                    } catch (RuntimeException ignored) {
                        // best-effort rollback
                    }
                }
            }
            throw e;
        }

        // Re-check coupon limits after reservation (the count + increment below
        // are authoritative for the fast-feedback path above).
        if (couponId != null) {
            Coupon coupon = couponRepository.findById(couponId)
                    .orElseThrow(() -> ApiException.badRequest("Invalid coupon code", "INVALID_COUPON"));
            long usage = couponUsageRepository.countByCouponIdAndUserId(couponId, userId);
            if (usage >= coupon.perUserLimit) {
                releaseAll(orderItems, orderNumber);
                throw ApiException.badRequest("You have already used this coupon", "COUPON_USER_LIMIT_REACHED");
            }
            if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
                releaseAll(orderItems, orderNumber);
                throw ApiException.badRequest(
                        "This coupon has reached its usage limit", "COUPON_EXHAUSTED");
            }
        }

        Order order = new Order();
        order.orderNumber = orderNumber;
        order.userId = userId;
        order.items = orderItems;
        order.subtotalCents = subtotalCents;
        order.discountTotalCents = couponDiscountCents;
        order.couponCode = couponCode;
        order.couponDiscountCents = couponDiscountCents;
        order.taxTotalCents = taxTotalCents;
        order.shippingCents = shippingCents;
        order.totalCents = totalCents;
        order.currency = "USD";
        order.shippingAddress = shippingAddress;
        order.status = Order.STATUS_PENDING;
        order.statusHistory = List.of(historyEntry(Order.STATUS_PENDING, "Order placed", userId));
        order.paymentStatus = Order.PAYMENT_PENDING;
        order.stockDeducted = false;
        order.placedAt = Instant.now();
        order.createdAt = order.placedAt;
        order.updatedAt = order.placedAt;

        Order created = orderRepository.save(order);
        cartRepository.deleteById(cart.id);

        if (couponId != null) {
            CouponUsage usage = new CouponUsage();
            usage.couponId = couponId;
            usage.userId = userId;
            usage.orderId = created.id;
            usage.discountCents = couponDiscountCents;
            usage.usedAt = Instant.now();
            usage.createdAt = usage.usedAt;
            usage.updatedAt = usage.usedAt;
            couponUsageRepository.save(usage);
            couponRepository.findById(couponId).ifPresent(c -> {
                c.usedCount = c.usedCount + 1;
                c.updatedAt = Instant.now();
                couponRepository.save(c);
            });
        }

        auditService.log("order.created", userId, null, Map.of(
                "orderId", created.id, "orderNumber", created.orderNumber, "totalCents", totalCents));
        notificationService.notify(userId, NotificationService.TYPE_ORDER_PLACED,
                "Order placed", "Your order " + created.orderNumber + " has been received.");
        return toOrderPublic(created);
    }

    private void releaseAll(List<OrderItem> orderItems, String orderNumber) {
        for (OrderItem item : orderItems) {
            try {
                inventoryService.releaseStock(
                        item.productId, item.variantId, item.quantity,
                        "order " + orderNumber + " rolled back",
                        new MovementReference("order", orderNumber, null));
            } catch (RuntimeException ignored) {
                // best-effort rollback
            }
        }
    }

    // ----------------------------------------------------------------- Reads

    public OrderPublic getOrderById(String orderId, String userId) {
        Order order = requireOrder(orderId);
        if (userId != null && !userId.equals(order.userId)) {
            throw ApiException.notFound("Order not found");
        }
        return toOrderPublic(order);
    }

    public record OrderListResult(List<OrderPublic> orders, long total) {}

    public OrderListResult listCustomerOrders(String userId, int page, int limit, String status) {
        Query query = new Query(Criteria.where("userId").is(userId));
        if (status != null && !status.isBlank()) {
            query.addCriteria(Criteria.where("status").is(status));
        }
        long total = mongo.count(query, Order.class);
        List<Order> orders = runList(query, page, limit);
        return new OrderListResult(orders.stream().map(this::toOrderPublic).toList(), total);
    }

    public OrderListResult listAdminOrders(
            int page, int limit, String status, String userId, String orderNumber,
            String from, String to) {
        Query query = new Query();
        if (status != null && !status.isBlank()) {
            query.addCriteria(Criteria.where("status").is(status));
        }
        if (userId != null && !userId.isBlank()) {
            query.addCriteria(Criteria.where("userId").is(userId));
        }
        if (orderNumber != null && !orderNumber.isBlank()) {
            query.addCriteria(Criteria.where("orderNumber")
                    .regex(Pattern.quote(orderNumber), "i"));
        }
        if (from != null || to != null) {
            Criteria placed = Criteria.where("placedAt");
            if (from != null && !from.isBlank()) {
                placed.gte(Instant.parse(from));
            }
            if (to != null && !to.isBlank()) {
                placed.lte(Instant.parse(to));
            }
            query.addCriteria(placed);
        }
        long total = mongo.count(query, Order.class);
        List<Order> orders = runList(query, page, limit);
        return new OrderListResult(orders.stream().map(this::toOrderPublic).toList(), total);
    }

    private List<Order> runList(Query query, int page, int limit) {
        query.with(Sort.by(Sort.Direction.DESC, "placedAt"))
                .skip((long) (page - 1) * limit)
                .limit(limit);
        return mongo.find(query, Order.class);
    }

    // ----------------------------------------------------------- Lifecycle

    /** Payment succeeded → confirm the order and convert reservations into sales. */
    public OrderPublic markOrderPaid(String orderId, String paymentId) {
        Order order = requireOrder(orderId);
        if (!Order.STATUS_PENDING.equals(order.status) && !Order.STATUS_CONFIRMED.equals(order.status)) {
            throw ApiException.conflict(
                    "Order cannot be confirmed from its current status", "INVALID_ORDER_TRANSITION");
        }
        for (OrderItem item : order.items) {
            inventoryService.deductStock(
                    item.productId, item.variantId, item.quantity,
                    "order " + order.orderNumber + " paid",
                    new MovementReference("order", order.id, null));
        }
        assertTransition(order.status, Order.STATUS_CONFIRMED, "payment confirmation");
        order.status = Order.STATUS_CONFIRMED;
        order.paymentStatus = Order.PAYMENT_PAID;
        order.paymentId = paymentId;
        order.stockDeducted = true;
        pushStatusHistory(order, Order.STATUS_CONFIRMED, "Payment received, order confirmed", "system");
        order.updatedAt = Instant.now();
        orderRepository.save(order);

        auditService.log("order.status_changed", null, null,
                Map.of("orderId", orderId, "from", Order.STATUS_PENDING, "to", Order.STATUS_CONFIRMED));
        notificationService.notify(order.userId, NotificationService.TYPE_ORDER_CONFIRMED,
                "Order confirmed", "Payment received for order " + order.orderNumber + ".");
        return toOrderPublic(order);
    }

    /** Payment failed → release the reservation so the stock is sellable again. */
    public OrderPublic markOrderPaymentFailed(String orderId) {
        Order order = requireOrder(orderId);
        if (order.stockDeducted) {
            throw ApiException.conflict(
                    "Order was already paid; refund instead of marking payment failed",
                    "INVALID_ORDER_TRANSITION");
        }
        for (OrderItem item : order.items) {
            inventoryService.releaseStock(
                    item.productId, item.variantId, item.quantity,
                    "order " + order.orderNumber + " payment failed",
                    new MovementReference("order", order.id, null));
        }
        order.paymentStatus = Order.PAYMENT_FAILED;
        order.updatedAt = Instant.now();
        orderRepository.save(order);
        auditService.log("order.status_changed", null, null,
                Map.of("orderId", orderId, "note", "payment_failed"));
        notificationService.notify(order.userId, NotificationService.TYPE_PAYMENT_FAILED,
                "Payment failed", "Payment for order " + order.orderNumber + " could not be completed.");
        return toOrderPublic(order);
    }

    /** Retry payment on a pending order whose previous attempt failed. */
    public OrderPublic prepareOrderForPayment(String orderId) {
        Order order = requireOrder(orderId);
        if (!Order.STATUS_PENDING.equals(order.status)
                || !Order.PAYMENT_FAILED.equals(order.paymentStatus)) {
            throw ApiException.conflict(
                    "Only pending orders with a failed payment can be retried", "INVALID_ORDER_TRANSITION");
        }
        for (OrderItem item : order.items) {
            inventoryService.reserveStock(
                    item.productId, item.variantId, item.quantity,
                    "order " + order.orderNumber + " retry",
                    new MovementReference("order", order.id, null));
        }
        order.paymentStatus = Order.PAYMENT_PENDING;
        order.updatedAt = Instant.now();
        orderRepository.save(order);
        return toOrderPublic(order);
    }

    public OrderPublic adminTransitionOrder(String orderId, String to, String note, String actorId) {
        Order order = requireOrder(orderId);
        String fromStatus = order.status;
        assertTransition(fromStatus, to, "admin transition");

        if (Order.STATUS_CANCELLED.equals(to)) {
            return cancelOrder(order, note == null ? "" : note, actorId, true);
        }

        order.status = to;
        pushStatusHistory(order, to, note == null ? "" : note, actorId);
        order.updatedAt = Instant.now();
        orderRepository.save(order);
        auditService.log("order.status_changed", actorId, null,
                Map.of("orderId", orderId, "from", fromStatus, "to", to));

        if (Order.STATUS_SHIPPED.equals(to)) {
            notificationService.notify(order.userId, NotificationService.TYPE_ORDER_SHIPPED,
                    "Order shipped", "Your order " + order.orderNumber + " is on its way.");
        } else if (Order.STATUS_DELIVERED.equals(to)) {
            notificationService.notify(order.userId, NotificationService.TYPE_ORDER_DELIVERED,
                    "Order delivered", "Your order " + order.orderNumber + " was delivered.");
        }
        return toOrderPublic(order);
    }

    public OrderPublic cancelOrderByCustomer(String orderId, String userId, String reason) {
        Order order = requireOrder(orderId);
        if (!userId.equals(order.userId)) {
            throw ApiException.notFound("Order not found");
        }

        if (Order.STATUS_PENDING.equals(order.status) && !Order.PAYMENT_PAID.equals(order.paymentStatus)) {
            return cancelOrder(order, reason == null ? "Cancelled by customer" : reason, userId, false);
        }
        if (Order.STATUS_CONFIRMED.equals(order.status) || Order.STATUS_PROCESSING.equals(order.status)) {
            assertTransition(order.status, Order.STATUS_REFUND_REQUESTED,
                    "customer cancellation of paid order");
            order.status = Order.STATUS_REFUND_REQUESTED;
            OrderRefund refund = new OrderRefund();
            refund.amountCents = order.totalCents;
            refund.reason = reason == null ? "Cancelled after payment" : reason;
            refund.status = "requested";
            refund.at = Instant.now();
            order.refunds.add(refund);
            pushStatusHistory(order, Order.STATUS_REFUND_REQUESTED,
                    "Cancellation requested after payment", userId);
            order.updatedAt = Instant.now();
            orderRepository.save(order);
            auditService.log("order.refund_requested", userId, null, Map.of("orderId", orderId));
            notificationService.notify(userId, NotificationService.TYPE_REFUND_REQUESTED,
                    "Refund requested",
                    "We are processing your refund for order " + order.orderNumber + ".");
            return toOrderPublic(order);
        }

        throw ApiException.conflict("Order cannot be cancelled from its current status",
                "INVALID_ORDER_TRANSITION");
    }

    public OrderPublic requestRefund(String orderId, String userId, String reason) {
        Order order = requireOrder(orderId);
        if (!userId.equals(order.userId)) {
            throw ApiException.notFound("Order not found");
        }
        assertTransition(order.status, Order.STATUS_REFUND_REQUESTED, "customer refund request");

        order.status = Order.STATUS_REFUND_REQUESTED;
        OrderRefund refund = new OrderRefund();
        refund.amountCents = order.totalCents;
        refund.reason = reason;
        refund.status = "requested";
        refund.at = Instant.now();
        order.refunds.add(refund);
        pushStatusHistory(order, Order.STATUS_REFUND_REQUESTED, reason, userId);
        order.updatedAt = Instant.now();
        orderRepository.save(order);
        auditService.log("order.refund_requested", userId, null, Map.of("orderId", orderId));
        notificationService.notify(userId, NotificationService.TYPE_REFUND_REQUESTED,
                "Refund requested",
                "Your refund request for order " + order.orderNumber + " has been received.");
        return toOrderPublic(order);
    }

    /** Called by the payment module once the provider confirms a refund. */
    public OrderPublic finalizeRefund(
            String orderId, long amountCents, String reason, String paymentRefundId, String actorId) {
        Order order = requireOrder(orderId);
        if (!Order.PAYMENT_PAID.equals(order.paymentStatus)
                && !Order.PAYMENT_REFUNDED.equals(order.paymentStatus)) {
            throw ApiException.conflict("Only paid orders can be refunded", "INVALID_ORDER_TRANSITION");
        }

        if (order.stockDeducted) {
            for (OrderItem item : order.items) {
                inventoryService.restock(
                        item.productId, item.variantId, item.quantity,
                        "order " + order.orderNumber + " refunded", actorId);
            }
            order.stockDeducted = false;
        }
        order.paymentStatus = Order.PAYMENT_REFUNDED;
        order.status = Order.STATUS_REFUNDED;
        if (!order.refunds.isEmpty()) {
            OrderRefund refund = order.refunds.get(order.refunds.size() - 1);
            refund.status = "processed";
            refund.paymentRefundId = paymentRefundId;
            refund.amountCents = amountCents;
        } else {
            OrderRefund refund = new OrderRefund();
            refund.amountCents = amountCents;
            refund.reason = reason;
            refund.status = "processed";
            refund.paymentRefundId = paymentRefundId;
            refund.at = Instant.now();
            order.refunds.add(refund);
        }
        pushStatusHistory(order, Order.STATUS_REFUNDED, reason, actorId);
        order.updatedAt = Instant.now();
        orderRepository.save(order);

        auditService.log("payment.refunded", actorId, null,
                Map.of("orderId", orderId, "amountCents", amountCents));
        notificationService.notify(order.userId, NotificationService.TYPE_REFUND_PROCESSED,
                "Refund processed",
                "A refund of $" + String.format("%.2f", amountCents / 100.0)
                        + " was issued for order " + order.orderNumber + ".");
        return toOrderPublic(order);
    }

    private OrderPublic cancelOrder(Order order, String reason, String actorId, boolean isAdmin) {
        assertTransition(order.status, Order.STATUS_CANCELLED,
                isAdmin ? "admin cancellation" : "customer cancellation");

        boolean wasPaid = Order.PAYMENT_PAID.equals(order.paymentStatus);
        for (OrderItem item : order.items) {
            if (wasPaid) {
                inventoryService.restock(
                        item.productId, item.variantId, item.quantity,
                        "order " + order.orderNumber + " cancelled", actorId);
            } else {
                inventoryService.releaseStock(
                        item.productId, item.variantId, item.quantity,
                        "order " + order.orderNumber + " cancelled",
                        new MovementReference("order", order.id, null));
            }
        }

        order.status = Order.STATUS_CANCELLED;
        order.cancelledAt = Instant.now();
        order.cancelledReason = reason;
        order.paymentStatus = wasPaid ? Order.PAYMENT_REFUNDED : Order.PAYMENT_FAILED;
        order.stockDeducted = false;
        pushStatusHistory(order, Order.STATUS_CANCELLED, reason, actorId);
        order.updatedAt = order.cancelledAt;
        orderRepository.save(order);

        auditService.log("order.cancelled", actorId, null,
                Map.of("orderId", order.id, "reason", reason));
        notificationService.notify(order.userId, NotificationService.TYPE_ORDER_CANCELLED,
                "Order cancelled", "Order " + order.orderNumber + " was cancelled.");
        return toOrderPublic(order);
    }

    // -------------------------------------------------------------- Internals

    private Order requireOrder(String orderId) {
        if (!OBJECT_ID.matcher(orderId).matches()) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return orderRepository.findById(orderId).orElseThrow(() -> ApiException.notFound("Order not found"));
    }

    private Order.ShippingAddress resolveShippingAddress(
            String userId, OrderDtos.CreateOrderRequest input) {
        if (input.shippingAddressId() != null && !input.shippingAddressId().isBlank()) {
            User user = userRepository.findById(userId).orElse(null);
            Address address = null;
            if (user != null && user.addresses != null) {
                for (Address a : user.addresses) {
                    if (input.shippingAddressId().equals(a.id)) {
                        address = a;
                        break;
                    }
                }
            }
            if (address == null) {
                throw ApiException.badRequest("Shipping address not found", "ADDRESS_NOT_FOUND");
            }
            Order.ShippingAddress result = new Order.ShippingAddress();
            result.fullName = address.recipient;
            result.phone = address.phone;
            result.line1 = address.line1;
            result.line2 = address.line2;
            result.city = address.city;
            result.state = address.state;
            result.postalCode = address.postalCode;
            result.country = address.country;
            return result;
        }
        if (input.shippingAddress() != null) {
            OrderDtos.ShippingAddressInput a = input.shippingAddress();
            Order.ShippingAddress result = new Order.ShippingAddress();
            result.fullName = a.fullName();
            result.phone = a.phone();
            result.line1 = a.line1();
            result.line2 = a.line2();
            result.city = a.city();
            result.state = a.state();
            result.postalCode = a.postalCode();
            result.country = a.country();
            return result;
        }
        throw ApiException.badRequest("Either shippingAddressId or shippingAddress is required",
                "SHIPPING_ADDRESS_REQUIRED");
    }

    private Variant findVariant(Product product, String variantId) {
        for (Variant variant : product.variants) {
            if (variantId.equals(variant.id)) {
                return variant;
            }
        }
        return null;
    }

    private String generateOrderNumber() {
        String yyyymmdd = ORD_DATE.format(Instant.now());
        byte[] bytes = new byte[4];
        RANDOM.nextBytes(bytes);
        StringBuilder hex = new StringBuilder();
        for (byte b : bytes) {
            hex.append(String.format("%02X", b));
        }
        return "ORD-" + yyyymmdd + "-" + hex;
    }

    private OrderStatusEvent historyEntry(String status, String note, String changedBy) {
        OrderStatusEvent event = new OrderStatusEvent();
        event.status = status;
        event.note = note;
        event.changedBy = changedBy;
        event.at = Instant.now();
        return event;
    }

    private void pushStatusHistory(Order order, String status, String note, String changedBy) {
        order.statusHistory.add(historyEntry(status, note, changedBy));
    }

    private static String firstOf(List<String> first, List<String> second) {
        if (first != null && !first.isEmpty()) {
            return first.get(0);
        }
        if (second != null && !second.isEmpty()) {
            return second.get(0);
        }
        return null;
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
