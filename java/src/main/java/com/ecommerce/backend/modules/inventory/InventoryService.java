package com.ecommerce.backend.modules.inventory;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.catalog.Variant;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

/**
 * Concurrency-safe stock operations (mirrors {@code inventory.service.ts}).
 * Each operation is a single atomic findAndModify whose filter includes the
 * stock guard (e.g. available &gt;= qty), so overselling is prevented at the
 * database level even across replicas.
 */
@Service
public class InventoryService {

    private final MongoTemplate mongo;
    private final InventoryMovementRepository movementRepository;
    private final AuditService auditService;

    public InventoryService(
            MongoTemplate mongo,
            InventoryMovementRepository movementRepository,
            AuditService auditService) {
        this.mongo = mongo;
        this.movementRepository = movementRepository;
        this.auditService = auditService;
    }

    public record StockSnapshot(
            long quantity, long reserved, long available, long lowStockThreshold) {}

    public record MovementReference(String referenceType, String referenceId, String actorId) {
        public static MovementReference manual(String actorId) {
            return new MovementReference("manual", null, actorId);
        }
    }

    // ------------------------------------------------------------------ Ops

    public StockSnapshot reserveStock(
            String productId, String variantId, long quantity, String reason, MovementReference ctx) {
        Product updated = findAndModify(
                new Query(Criteria.where("_id")
                        .is(productId)
                        .and("variants._id")
                        .is(variantId)
                        .and("variants.isActive")
                        .is(true)
                        .and("variants.stock.available")
                        .gte(quantity)),
                new Update()
                        .inc("variants.$.stock.reserved", quantity)
                        .inc("variants.$.stock.available", -quantity));

        if (updated == null) {
            boolean exists = variantExists(productId, variantId);
            if (!exists) {
                throw ApiException.notFound("Product variant not found");
            }
            throw ApiException.conflict("Insufficient stock for reservation", "INSUFFICIENT_STOCK");
        }
        Variant variant = requireVariant(updated, variantId);
        long after = variant.available();
        recordMovement(productId, variantId, variant.sku, InventoryMovement.TYPE_RESERVATION,
                -quantity, after + quantity, after, reason, ctx);
        return snapshot(variant);
    }

    public StockSnapshot releaseStock(
            String productId, String variantId, long quantity, String reason, MovementReference ctx) {
        Product updated = findAndModify(
                new Query(Criteria.where("_id")
                        .is(productId)
                        .and("variants._id")
                        .is(variantId)
                        .and("variants.stock.reserved")
                        .gte(quantity)),
                new Update()
                        .inc("variants.$.stock.reserved", -quantity)
                        .inc("variants.$.stock.available", quantity));

        if (updated == null) {
            throw ApiException.conflict(
                    "Cannot release more stock than is reserved", "RESERVATION_MISMATCH");
        }
        Variant variant = requireVariant(updated, variantId);
        long after = variant.available();
        recordMovement(productId, variantId, variant.sku, InventoryMovement.TYPE_RELEASE,
                quantity, after - quantity, after, reason, ctx);
        return snapshot(variant);
    }

    /** A confirmed/paid order converts reservation into a sale. */
    public StockSnapshot deductStock(
            String productId, String variantId, long quantity, String reason, MovementReference ctx) {
        Product updated = findAndModify(
                new Query(Criteria.where("_id")
                        .is(productId)
                        .and("variants._id")
                        .is(variantId)
                        .and("variants.stock.reserved")
                        .gte(quantity)),
                new Update()
                        .inc("variants.$.stock.reserved", -quantity)
                        .inc("variants.$.stock.quantity", -quantity));

        if (updated == null) {
            throw ApiException.conflict(
                    "Cannot deduct more stock than is reserved", "RESERVATION_MISMATCH");
        }
        Variant variant = requireVariant(updated, variantId);
        recordMovement(productId, variantId, variant.sku, InventoryMovement.TYPE_SALE,
                -quantity, variant.available(), variant.available(), reason, ctx);
        return snapshot(variant);
    }

    public StockSnapshot restock(
            String productId, String variantId, long quantity, String reason, String actorId) {
        Product updated = findAndModify(
                new Query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                new Update()
                        .inc("variants.$.stock.quantity", quantity)
                        .inc("variants.$.stock.available", quantity));

        if (updated == null) {
            throw ApiException.notFound("Product variant not found");
        }
        Variant variant = requireVariant(updated, variantId);
        long after = variant.available();
        recordMovement(productId, variantId, variant.sku, InventoryMovement.TYPE_RESTOCK,
                quantity, after - quantity, after, reason, MovementReference.manual(actorId));
        auditService.log("inventory.restocked", actorId, null,
                Map.of("productId", productId, "variantId", variantId,
                        "quantity", quantity, "sku", variant.sku));
        return snapshot(variant);
    }

    public StockSnapshot adjustStock(
            String productId, String variantId, long newQuantity, String reason, String actorId) {
        Product product = mongo.findOne(
                Query.query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                Product.class);
        if (product == null) {
            throw ApiException.notFound("Product variant not found");
        }
        Variant current = requireVariant(product, variantId);

        long delta = newQuantity - current.stock.quantity;
        if (delta == 0) {
            return snapshot(current);
        }
        long newAvailable = current.available() + delta;
        if (newAvailable < 0) {
            throw ApiException.badRequest(
                    "Adjustment would make available stock negative; release reservations first",
                    "NEGATIVE_AVAILABLE_STOCK");
        }

        Product updated = findAndModify(
                new Query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                new Update()
                        .inc("variants.$.stock.quantity", delta)
                        .inc("variants.$.stock.available", delta));
        if (updated == null) {
            throw ApiException.badRequest("Stock update failed", "STOCK_UPDATE_FAILED");
        }
        Variant variant = requireVariant(updated, variantId);
        long after = variant.available();
        recordMovement(productId, variantId, variant.sku, InventoryMovement.TYPE_ADJUSTMENT,
                delta, after - delta, after, reason, MovementReference.manual(actorId));
        auditService.log("inventory.adjusted", actorId, null,
                Map.of("productId", productId, "variantId", variantId, "delta", delta, "reason", reason));
        return snapshot(variant);
    }

    public StockSnapshot getStock(String productId, String variantId) {
        Product product = mongo.findOne(
                Query.query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                Product.class);
        if (product == null) {
            throw ApiException.notFound("Product variant not found");
        }
        return snapshot(requireVariant(product, variantId));
    }

    // -------------------------------------------------------------- Movements

    public record MovementPublic(
            String id,
            String productId,
            String variantId,
            String sku,
            String type,
            long quantity,
            Long beforeAvailable,
            Long afterAvailable,
            String reason,
            String referenceType,
            String referenceId,
            String createdAt) {}

    public record MovementListResult(List<MovementPublic> movements, long total) {}

    public MovementListResult listMovements(
            int page,
            int limit,
            String productId,
            String variantId,
            String type,
            String sku) {
        Query query = new Query();
        if (productId != null && !productId.isBlank()) {
            query.addCriteria(Criteria.where("productId").is(productId));
        }
        if (variantId != null && !variantId.isBlank()) {
            query.addCriteria(Criteria.where("variantId").is(variantId));
        }
        if (type != null && !type.isBlank()) {
            query.addCriteria(Criteria.where("type").is(type));
        }
        if (sku != null && !sku.isBlank()) {
            query.addCriteria(Criteria.where("sku").is(sku.toUpperCase()));
        }
        long total = mongo.count(query, InventoryMovement.class);
        query.with(Sort.by(Sort.Direction.DESC, "createdAt"))
                .skip((long) (page - 1) * limit)
                .limit(limit);
        List<InventoryMovement> movements = mongo.find(query, InventoryMovement.class);
        List<MovementPublic> items = movements.stream()
                .map(m -> new MovementPublic(
                        m.id,
                        m.productId,
                        m.variantId,
                        m.sku,
                        m.type,
                        m.quantity,
                        m.beforeAvailable,
                        m.afterAvailable,
                        m.reason,
                        m.referenceType,
                        m.referenceId,
                        iso(m.createdAt)))
                .toList();
        return new MovementListResult(items, total);
    }

    public record LowStockItem(
            String productId, String name, String sku, String variantId,
            long available, long lowStockThreshold) {}

    public List<LowStockItem> listLowStock() {
        List<AggregationOperation> ops = new ArrayList<>();
        ops.add(ctx -> new Document("$match", new Document()
                .append("status", Product.STATUS_PUBLISHED)
                .append("isActive", true)
                .append("variants", new Document("$elemMatch", new Document("isActive", true)))));
        ops.add(ctx -> new Document("$unwind", "$variants"));
        ops.add(ctx -> new Document("$match", new Document()
                .append("variants.isActive", true)
                .append("$expr", new Document("$lte", List.of(
                        "$variants.stock.available",
                        "$variants.stock.lowStockThreshold")))));
        ops.add(ctx -> new Document("$sort", new Document("variants.stock.available", 1)));

        AggregationResults<Document> result = mongo.aggregate(
                Aggregation.newAggregation(Product.class, ops), Document.class);
        return result.getMappedResults().stream()
                .map(d -> {
                    Document variant = (Document) d.get("variants");
                    Document stock = (Document) variant.get("stock");
                    return new LowStockItem(
                            d.get("_id").toString(),
                            d.getString("name"),
                            variant.getString("sku"),
                            variant.get("_id").toString(),
                            stock.get("available", Number.class).longValue(),
                            stock.get("lowStockThreshold", Number.class).longValue());
                })
                .toList();
    }

    // -------------------------------------------------------------- Internals

    private Product findAndModify(Query query, Update update) {
        return mongo.findAndModify(
                query, update, FindAndModifyOptions.options().returnNew(true), Product.class);
    }

    private boolean variantExists(String productId, String variantId) {
        return mongo.exists(
                Query.query(Criteria.where("_id").is(productId).and("variants._id").is(variantId)),
                Product.class);
    }

    private Variant requireVariant(Product product, String variantId) {
        for (Variant variant : product.variants) {
            if (variantId.equals(variant.id)) {
                return variant;
            }
        }
        throw ApiException.badRequest("Variant missing after stock update", "VARIANT_MISSING");
    }

    private StockSnapshot snapshot(Variant variant) {
        return new StockSnapshot(
                variant.stock.quantity,
                variant.stock.reserved,
                variant.stock.available,
                variant.stock.lowStockThreshold);
    }

    private void recordMovement(
            String productId,
            String variantId,
            String sku,
            String type,
            long quantity,
            Long before,
            Long after,
            String reason,
            MovementReference ctx) {
        try {
            InventoryMovement movement = new InventoryMovement();
            movement.productId = productId;
            movement.variantId = variantId;
            movement.sku = sku;
            movement.type = type;
            movement.quantity = quantity;
            movement.beforeAvailable = before;
            movement.afterAvailable = after;
            movement.reason = reason;
            movement.referenceType = ctx.referenceType();
            movement.referenceId = ctx.referenceId();
            movement.actorId = ctx.actorId();
            movement.createdAt = Instant.now();
            movementRepository.insert(movement);
        } catch (RuntimeException e) {
            // Stock bookkeeping must never break the operation that triggered it.
        }
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
