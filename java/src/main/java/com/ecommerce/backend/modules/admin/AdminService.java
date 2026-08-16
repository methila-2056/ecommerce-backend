package com.ecommerce.backend.modules.admin;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditLog;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.Variant;
import com.ecommerce.backend.modules.inventory.InventoryService;
import com.ecommerce.backend.modules.order.Order;
import com.ecommerce.backend.modules.order.OrderService;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/** Staff dashboard, audit trail and product analytics (mirrors {@code admin.service.ts}). */
@Service
public class AdminService {

    private static final List<String> PAID_STATUSES = List.of(
            Order.STATUS_CONFIRMED,
            Order.STATUS_PROCESSING,
            Order.STATUS_PACKED,
            Order.STATUS_SHIPPED,
            Order.STATUS_DELIVERED);

    private final MongoTemplate mongo;
    private final UserRepository userRepository;
    private final InventoryService inventoryService;
    private final OrderService orderService;

    public AdminService(
            MongoTemplate mongo,
            UserRepository userRepository,
            InventoryService inventoryService,
            OrderService orderService) {
        this.mongo = mongo;
        this.userRepository = userRepository;
        this.inventoryService = inventoryService;
        this.orderService = orderService;
    }

    // ------------------------------------------------------------- Dashboard

    public record TopProduct(String productId, String name, long quantitySold, long revenueCents) {}

    public record TopCustomer(String userId, String name, long orderCount, long spentCents) {}

    public record RevenueByDay(String date, long revenueCents, long orders) {}

    public record DashboardSummary(
            long revenueCents,
            long paidOrdersCount,
            long avgOrderValueCents,
            Map<String, Long> ordersByStatus,
            long totalOrders,
            long totalUsers,
            long activeCustomers,
            long publishedProducts,
            long lowStockCount,
            List<OrderService.OrderPublic> recentOrders,
            List<TopProduct> topProducts,
            List<TopCustomer> topCustomers,
            List<RevenueByDay> revenueByDay) {}

    public DashboardSummary getDashboardSummary() {
        List<Document> revenueRows = aggregate(Order.class,
                Aggregation.newAggregation(
                        Aggregation.match(Criteria.where("status").in(PAID_STATUSES)),
                        Aggregation.group()
                                .sum("totalCents")
                                .as("revenueCents")
                                .count()
                                .as("count")));
        long revenueCents = revenueRows.isEmpty()
                ? 0
                : ((Number) revenueRows.get(0).get("revenueCents")).longValue();
        long paidOrdersCount = revenueRows.isEmpty()
                ? 0
                : ((Number) revenueRows.get(0).get("count")).longValue();

        Map<String, Long> ordersByStatus = new LinkedHashMap<>();
        List<Document> statusRows = aggregate(Order.class,
                Aggregation.newAggregation(
                        Aggregation.group("status").count().as("count")));
        for (Document row : statusRows) {
            ordersByStatus.put(row.get("_id").toString(), ((Number) row.get("count")).longValue());
        }

        long userCount = mongo.count(new Query(), User.class);
        long activeCustomers = mongo.count(
                Query.query(Criteria.where("roles").is("CUSTOMER").and("status").is(User.STATUS_ACTIVE)),
                User.class);
        long publishedProducts = mongo.count(
                Query.query(Criteria.where("status")
                        .is(Product.STATUS_PUBLISHED)
                        .and("isActive")
                        .is(true)),
                Product.class);
        long lowStockCount = inventoryService.listLowStock().size();

        Query recentQuery = new Query(Criteria.where("status").in(PAID_STATUSES));
        recentQuery.with(Sort.by(Sort.Direction.DESC, "placedAt")).limit(5);
        List<OrderService.OrderPublic> recentOrders = mongo.find(recentQuery, Order.class).stream()
                .map(orderService::toOrderPublic)
                .toList();

        List<Document> topProductsRows = aggregate(Order.class,
                Aggregation.newAggregation(
                        Aggregation.match(Criteria.where("status").in(PAID_STATUSES)),
                        Aggregation.unwind("items"),
                        Aggregation.group("items.productId")
                                .sum("items.quantity")
                                .as("quantitySold")
                                .sum("items.lineTotalCents")
                                .as("revenueCents"),
                        Aggregation.sort(Sort.by(Sort.Direction.DESC, "quantitySold")),
                        Aggregation.limit(5)));
        List<String> productIds = new ArrayList<>();
        for (Document row : topProductsRows) {
            productIds.add(row.get("_id").toString());
        }
        Map<String, String> productNameById = namesForProducts(productIds);

        List<TopProduct> topProducts = new ArrayList<>();
        for (Document row : topProductsRows) {
            String productId = row.get("_id").toString();
            topProducts.add(new TopProduct(
                    productId,
                    productNameById.getOrDefault(productId, "Unknown product"),
                    ((Number) row.get("quantitySold")).longValue(),
                    ((Number) row.get("revenueCents")).longValue()));
        }

        List<Document> topCustomersRows = aggregate(Order.class,
                Aggregation.newAggregation(
                        Aggregation.match(Criteria.where("status").in(PAID_STATUSES)),
                        Aggregation.group("userId")
                                .count()
                                .as("orderCount")
                                .sum("totalCents")
                                .as("spentCents"),
                        Aggregation.sort(Sort.by(Sort.Direction.DESC, "spentCents")),
                        Aggregation.limit(5)));
        List<String> customerIds = new ArrayList<>();
        for (Document row : topCustomersRows) {
            customerIds.add(row.get("_id").toString());
        }
        Map<String, String> customerNameById = namesForUsers(customerIds);

        List<TopCustomer> topCustomers = new ArrayList<>();
        for (Document row : topCustomersRows) {
            String userId = row.get("_id").toString();
            topCustomers.add(new TopCustomer(
                    userId,
                    customerNameById.getOrDefault(userId, "Unknown user"),
                    ((Number) row.get("orderCount")).longValue(),
                    ((Number) row.get("spentCents")).longValue()));
        }

        List<AggregationOperation> dayOps = new ArrayList<>();
        dayOps.add(ctx -> new Document("$match", new Document()
                .append("status", new Document("$in", PAID_STATUSES))
                .append("placedAt", new Document("$gte",
                        Instant.now().minusSeconds(30L * 24 * 60 * 60)))));
        dayOps.add(ctx -> new Document("$group", new Document()
                .append("_id", new Document("$dateToString", new Document()
                        .append("format", "%Y-%m-%d")
                        .append("date", "$placedAt")))
                .append("revenueCents", new Document("$sum", "$totalCents"))
                .append("orders", new Document("$sum", 1))));
        dayOps.add(ctx -> new Document("$sort", new Document("_id", 1)));

        List<RevenueByDay> revenueByDay = new ArrayList<>();
        for (Document row : mongo.aggregate(
                Aggregation.newAggregation(Order.class, dayOps), Document.class).getMappedResults()) {
            revenueByDay.add(new RevenueByDay(
                    row.get("_id").toString(),
                    ((Number) row.get("revenueCents")).longValue(),
                    ((Number) row.get("orders")).longValue()));
        }

        long totalOrders = ordersByStatus.values().stream().mapToLong(Long::longValue).sum();

        return new DashboardSummary(
                revenueCents,
                paidOrdersCount,
                paidOrdersCount > 0 ? Math.round((double) revenueCents / paidOrdersCount) : 0,
                ordersByStatus,
                totalOrders,
                userCount,
                activeCustomers,
                publishedProducts,
                lowStockCount,
                recentOrders,
                topProducts,
                topCustomers,
                revenueByDay);
    }

    // --------------------------------------------------------------- Audit logs

    public record AuditLogPublic(
            String id,
            String event,
            Map<String, Object> meta,
            String actorId,
            String ip,
            String userAgent,
            String createdAt) {}

    public record AuditLogListResult(List<AuditLogPublic> logs, long total) {}

    public AuditLogListResult listAuditLogs(
            int page, int limit, String event, String actorId, String from, String to) {
        Query query = new Query();
        if (event != null && !event.isBlank()) {
            query.addCriteria(Criteria.where("action").is(event));
        }
        if (actorId != null && !actorId.isBlank()) {
            query.addCriteria(Criteria.where("actorUserId").is(actorId));
        }
        if (from != null && !from.isBlank() || to != null && !to.isBlank()) {
            Criteria range = Criteria.where("timestamp");
            if (from != null && !from.isBlank()) {
                range.gte(Instant.parse(from));
            }
            if (to != null && !to.isBlank()) {
                range.lte(Instant.parse(to));
            }
            query.addCriteria(range);
        }
        long total = mongo.count(query, AuditLog.class);
        query.with(Sort.by(Sort.Direction.DESC, "timestamp"))
                .skip((long) (page - 1) * limit)
                .limit(limit);
        List<AuditLog> logs = mongo.find(query, AuditLog.class);
        List<AuditLogPublic> items = logs.stream()
                .map(l -> new AuditLogPublic(
                        l.id,
                        l.action,
                        l.metadata == null ? Map.of() : l.metadata,
                        l.actorUserId,
                        l.ip,
                        null,
                        iso(l.timestamp)))
                .toList();
        return new AuditLogListResult(items, total);
    }

    // ----------------------------------------------------------- Product analytics

    public record ProductPerformance(
            String productId, long quantitySold, long revenueCents, long unitsReserved) {}

    public ProductPerformance getProductPerformance(String productId) {
        if (!ObjectId.isValid(productId)) {
            throw ApiException.badRequest("Invalid product identifier", "BAD_REQUEST");
        }
        List<Document> rows = aggregate(Order.class,
                Aggregation.newAggregation(
                        Aggregation.match(Criteria.where("status").in(PAID_STATUSES)),
                        Aggregation.unwind("items"),
                        Aggregation.match(Criteria.where("items.productId").is(productId)),
                        Aggregation.group()
                                .sum("items.quantity")
                                .as("quantitySold")
                                .sum("items.lineTotalCents")
                                .as("revenueCents")));
        long quantitySold = rows.isEmpty() ? 0 : ((Number) rows.get(0).get("quantitySold")).longValue();
        long revenueCents = rows.isEmpty() ? 0 : ((Number) rows.get(0).get("revenueCents")).longValue();

        Product product = mongo.findOne(
                Query.query(Criteria.where("_id").is(productId)), Product.class);
        long unitsReserved = 0;
        if (product != null) {
            for (Variant variant : product.variants) {
                unitsReserved += variant.stock == null ? 0 : variant.stock.reserved;
            }
        }
        return new ProductPerformance(productId, quantitySold, revenueCents, unitsReserved);
    }

    // -------------------------------------------------------------- Internals

    private List<Document> aggregate(Class<?> entityClass, Aggregation aggregation) {
        AggregationResults<Document> results =
                mongo.aggregate(aggregation, entityClass, Document.class);
        return results.getMappedResults();
    }

    private Map<String, String> namesForProducts(List<String> productIds) {
        Map<String, String> names = new HashMap<>();
        if (productIds.isEmpty()) {
            return names;
        }
        for (Product p : mongo.find(
                Query.query(Criteria.where("_id").in(productIds)), Product.class)) {
            names.put(p.id, p.name);
        }
        return names;
    }

    private Map<String, String> namesForUsers(List<String> userIds) {
        Map<String, String> names = new HashMap<>();
        if (userIds.isEmpty()) {
            return names;
        }
        for (User u : userRepository.findAllById(userIds)) {
            names.put(u.id, u.name);
        }
        return names;
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
