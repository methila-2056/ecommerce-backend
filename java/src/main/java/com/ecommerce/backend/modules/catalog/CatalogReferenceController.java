package com.ecommerce.backend.modules.catalog;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.modules.catalog.CatalogDtos.BrandPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.CategoryPublic;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public storefront reference lists (mirrors {@code /categories} and
 * {@code /brands} in {@code catalog.routes.ts}).
 */
@RestController
@RequestMapping("/api/v1")
public class CatalogReferenceController {

    private final CatalogService catalogService;

    public CatalogReferenceController(CatalogService catalogService) {
        this.catalogService = catalogService;
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
}
