package com.ecommerce.backend.modules.admin;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.modules.admin.AdminService.AuditLogListResult;
import com.ecommerce.backend.modules.admin.AdminService.AuditLogPublic;
import com.ecommerce.backend.modules.admin.AdminService.DashboardSummary;
import com.ecommerce.backend.modules.admin.AdminService.ProductPerformance;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Staff dashboard endpoints (mirrors {@code admin.routes.ts} + {@code admin.controller.ts}). */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private static final int AUDIT_MAX_LIMIT = 200;
    private static final int AUDIT_DEFAULT_LIMIT = 50;

    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/dashboard/summary")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<DashboardSummary>> dashboardSummary() {
        DashboardSummary summary = adminService.getDashboardSummary();
        return ResponseEntity.ok(
                ApiResponse.success(summary, "Dashboard summary retrieved successfully"));
    }

    @GetMapping("/audit-logs")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<AuditLogPublic>>> listAuditLogs(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String event,
            @RequestParam(required = false) String actorId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        int p = Pagination.parsePage(page);
        int l = parseAuditLimit(limit);
        AuditLogListResult result = adminService.listAuditLogs(p, l, event, actorId, from, to);
        PageMeta meta = PageMeta.of(p, l, result.total());
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", meta.page());
        metaMap.put("limit", meta.limit());
        metaMap.put("total", meta.total());
        metaMap.put("totalPages", meta.totalPages());
        metaMap.put("hasNextPage", meta.hasNextPage());
        metaMap.put("hasPreviousPage", meta.hasPreviousPage());
        return ResponseEntity.ok(
                ApiResponse.success(result.logs(), "Audit logs retrieved successfully", metaMap));
    }

    @GetMapping("/products/{productId}/performance")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<ProductPerformance>> productPerformance(
            @PathVariable String productId) {
        ProductPerformance performance = adminService.getProductPerformance(productId);
        return ResponseEntity.ok(
                ApiResponse.success(performance, "Product performance retrieved successfully"));
    }

    private int parseAuditLimit(String limit) {
        if (limit == null || limit.isBlank()) {
            return AUDIT_DEFAULT_LIMIT;
        }
        int parsed;
        try {
            parsed = Integer.parseInt(limit);
        } catch (NumberFormatException e) {
            throw new com.ecommerce.backend.common.error.ApiException(
                    org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Limit must be a positive integer",
                    "VALIDATION_ERROR");
        }
        return Math.min(Math.max(parsed, 1), AUDIT_MAX_LIMIT);
    }
}
