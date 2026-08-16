package com.ecommerce.backend.modules.catalog;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.catalog.CatalogDtos.BrandInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.BrandPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.CategoryInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.CategoryPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductStatus;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductUpdate;
import com.ecommerce.backend.modules.catalog.CatalogService.SearchResult;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Catalog + inventory endpoints (mirrors {@code catalog.routes.ts} + {@code catalog.controller.ts}). */
@RestController
@RequestMapping("/api/v1/products")
@Validated
public class CatalogController {

    private static final String ADMIN_ROLES = "hasAnyRole('SELLER','SUPPORT','ADMIN')";

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    // ------------------------------------------------------------- Public

    @GetMapping
    public ResponseEntity<ApiResponse<List<ProductPublic>>> searchProducts(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Long minPrice,
            @RequestParam(required = false) Long maxPrice,
            @RequestParam(required = false) Double rating,
            @RequestParam(required = false) Boolean inStock,
            @RequestParam(required = false) String sort) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        SearchResult result = catalogService.searchPublic(
                p, l, keyword, category, brand, minPrice, maxPrice, rating, inStock, sort);
        return ResponseEntity.ok(ApiResponse.success(
                result.items(), "Products retrieved successfully", meta(p, l, result.total())));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<ProductPublic>> getProductById(@PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.success(
                catalogService.adminGetProduct(id, false), "Product retrieved successfully"));
    }

    @GetMapping("/slug/{slug}")
    public ResponseEntity<ApiResponse<ProductPublic>> getProductBySlug(@PathVariable String slug) {
        return ResponseEntity.ok(ApiResponse.success(
                catalogService.getProductBySlug(slug), "Product retrieved successfully"));
    }

    @GetMapping("/categories")
    public ResponseEntity<ApiResponse<List<CategoryPublic>>> listCategories() {
        return ResponseEntity.ok(ApiResponse.success(
                catalogService.listCategories(), "Categories retrieved successfully"));
    }

    @GetMapping("/brands")
    public ResponseEntity<ApiResponse<List<BrandPublic>>> listBrands() {
        return ResponseEntity.ok(ApiResponse.success(
                catalogService.listBrands(), "Brands retrieved successfully"));
    }

    // ------------------------------------------------------------- Admin

    @GetMapping("/search/admin")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<List<ProductPublic>>> adminSearch(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String brand,
            @RequestParam(required = false) Long minPrice,
            @RequestParam(required = false) Long maxPrice,
            @RequestParam(required = false) Double rating,
            @RequestParam(required = false) Boolean inStock,
            @RequestParam(required = false) Boolean includeInactive,
            @RequestParam(required = false) String sort) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        SearchResult result = catalogService.searchAdmin(
                p, l, keyword, status, category, brand, minPrice, maxPrice, rating, inStock,
                includeInactive, sort);
        return ResponseEntity.ok(ApiResponse.success(
                result.items(), "Products retrieved successfully", meta(p, l, result.total())));
    }

    @GetMapping("/{id}/admin")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<ProductPublic>> adminGetProduct(
            @PathVariable String id,
            @RequestParam(required = false) Boolean includeInactive) {
        boolean inc = includeInactive != null && includeInactive;
        return ResponseEntity.ok(ApiResponse.success(
                catalogService.adminGetProduct(id, inc), "Product retrieved successfully"));
    }

    @PostMapping
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<ProductPublic>> createProduct(
            @Valid @RequestBody ProductInput input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        ProductPublic product =
                catalogService.createProduct(input, current.userId(), clientIp(request));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(product, "Product created successfully"));
    }

    @PutMapping("/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<ProductPublic>> updateProduct(
            @PathVariable String id,
            @Valid @RequestBody ProductUpdate input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        ProductPublic product =
                catalogService.updateProduct(id, input, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(product, "Product updated successfully"));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<ProductPublic>> setProductStatus(
            @PathVariable String id,
            @Valid @RequestBody ProductStatus input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        ProductPublic product = catalogService.setProductStatus(
                id, input.status(), current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(product, "Product status updated successfully"));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<Void>> archiveProduct(
            @PathVariable String id,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        catalogService.archiveProduct(id, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(null, "Product archived successfully"));
    }

    @PostMapping("/categories")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<CategoryPublic>> createCategory(
            @Valid @RequestBody CategoryInput input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        CategoryPublic category =
                catalogService.createCategory(input, current.userId(), clientIp(request));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(category, "Category created successfully"));
    }

    @PutMapping("/categories/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<CategoryPublic>> updateCategory(
            @PathVariable String id,
            @Valid @RequestBody CategoryInput input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        CategoryPublic category =
                catalogService.updateCategory(id, input, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(category, "Category updated successfully"));
    }

    @DeleteMapping("/categories/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
            @PathVariable String id,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        catalogService.deleteCategory(id, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(null, "Category deleted successfully"));
    }

    @PostMapping("/brands")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<BrandPublic>> createBrand(
            @Valid @RequestBody BrandInput input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        BrandPublic brand = catalogService.createBrand(input, current.userId(), clientIp(request));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(brand, "Brand created successfully"));
    }

    @PutMapping("/brands/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<BrandPublic>> updateBrand(
            @PathVariable String id,
            @Valid @RequestBody BrandInput input,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        BrandPublic brand = catalogService.updateBrand(id, input, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(brand, "Brand updated successfully"));
    }

    @DeleteMapping("/brands/{id}")
    @PreAuthorize(ADMIN_ROLES)
    public ResponseEntity<ApiResponse<Void>> deleteBrand(
            @PathVariable String id,
            @AuthenticationPrincipal CurrentUser user,
            HttpServletRequest request) {
        CurrentUser current = requireUser(user);
        catalogService.deleteBrand(id, current.userId(), clientIp(request));
        return ResponseEntity.ok(ApiResponse.success(null, "Brand deleted successfully"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }

    private Map<String, Object> meta(int page, int limit, long total) {
        PageMeta meta = PageMeta.of(page, limit, total);
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("page", meta.page());
        map.put("limit", meta.limit());
        map.put("total", meta.total());
        map.put("totalPages", meta.totalPages());
        map.put("hasNextPage", meta.hasNextPage());
        map.put("hasPreviousPage", meta.hasPreviousPage());
        return map;
    }

    private String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null && !forwarded.isBlank()
                ? forwarded.split(",")[0].trim()
                : request.getRemoteAddr();
    }
}
