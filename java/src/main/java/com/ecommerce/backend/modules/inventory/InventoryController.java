package com.ecommerce.backend.modules.inventory;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.inventory.InventoryDtos.AdjustRequest;
import com.ecommerce.backend.modules.inventory.InventoryDtos.QuantityRequest;
import com.ecommerce.backend.modules.inventory.InventoryDtos.RestockRequest;
import com.ecommerce.backend.modules.inventory.InventoryService.LowStockItem;
import com.ecommerce.backend.modules.inventory.InventoryService.MovementListResult;
import com.ecommerce.backend.modules.inventory.InventoryService.MovementPublic;
import com.ecommerce.backend.modules.inventory.InventoryService.MovementReference;
import com.ecommerce.backend.modules.inventory.InventoryService.StockSnapshot;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

/** Inventory endpoints (mirrors {@code inventory.routes.ts} + {@code inventory.controller.ts}). */
@RestController
@RequestMapping("/api/v1/inventory")
@Validated
public class InventoryController {

    private static final String MANAGE_ROLES = "hasAnyRole('SELLER','ADMIN')";

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping("/movements")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<List<MovementPublic>>> listMovements(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String productId,
            @RequestParam(required = false) String variantId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String sku) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        MovementListResult result =
                inventoryService.listMovements(p, l, productId, variantId, type, sku);
        PageMeta meta = PageMeta.of(p, l, result.total());
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", meta.page());
        metaMap.put("limit", meta.limit());
        metaMap.put("total", meta.total());
        metaMap.put("totalPages", meta.totalPages());
        metaMap.put("hasNextPage", meta.hasNextPage());
        metaMap.put("hasPreviousPage", meta.hasPreviousPage());
        return ResponseEntity.ok(ApiResponse.success(
                result.movements(), "Stock movements retrieved successfully", metaMap));
    }

    @GetMapping("/low-stock")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<List<LowStockItem>>> listLowStock() {
        return ResponseEntity.ok(ApiResponse.success(
                inventoryService.listLowStock(), "Low stock products retrieved successfully"));
    }

    @GetMapping("/{productId}/variants/{variantId}")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> getStock(
            @PathVariable String productId, @PathVariable String variantId) {
        return ResponseEntity.ok(ApiResponse.success(
                inventoryService.getStock(productId, variantId), "Stock retrieved successfully"));
    }

    @PostMapping("/{productId}/variants/{variantId}/restock")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> restock(
            @PathVariable String productId,
            @PathVariable String variantId,
            @Valid @RequestBody RestockRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        StockSnapshot stock = inventoryService.restock(
                productId, variantId, req.quantity(), req.reason() == null ? "" : req.reason(),
                current.userId());
        return ResponseEntity.ok(ApiResponse.success(stock, "Stock restocked successfully"));
    }

    @PostMapping("/{productId}/variants/{variantId}/adjust")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> adjust(
            @PathVariable String productId,
            @PathVariable String variantId,
            @Valid @RequestBody AdjustRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        StockSnapshot stock =
                inventoryService.adjustStock(productId, variantId, req.quantity(), req.reason(),
                        current.userId());
        return ResponseEntity.ok(ApiResponse.success(stock, "Stock adjusted successfully"));
    }

    @PostMapping("/{productId}/variants/{variantId}/reserve")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> reserve(
            @PathVariable String productId,
            @PathVariable String variantId,
            @Valid @RequestBody QuantityRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        StockSnapshot stock = inventoryService.reserveStock(
                productId, variantId, req.quantity(), "manual reservation",
                MovementReference.manual(current.userId()));
        return ResponseEntity.ok(ApiResponse.success(stock, "Stock reserved successfully"));
    }

    @PostMapping("/{productId}/variants/{variantId}/release")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> release(
            @PathVariable String productId,
            @PathVariable String variantId,
            @Valid @RequestBody QuantityRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        StockSnapshot stock = inventoryService.releaseStock(
                productId, variantId, req.quantity(), "manual release",
                MovementReference.manual(current.userId()));
        return ResponseEntity.ok(ApiResponse.success(stock, "Stock released successfully"));
    }

    @PostMapping("/{productId}/variants/{variantId}/deduct")
    @PreAuthorize(MANAGE_ROLES)
    public ResponseEntity<ApiResponse<StockSnapshot>> deduct(
            @PathVariable String productId,
            @PathVariable String variantId,
            @Valid @RequestBody QuantityRequest req,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        StockSnapshot stock = inventoryService.deductStock(
                productId, variantId, req.quantity(), "manual deduction",
                MovementReference.manual(current.userId()));
        return ResponseEntity.ok(ApiResponse.success(stock, "Stock deducted successfully"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
