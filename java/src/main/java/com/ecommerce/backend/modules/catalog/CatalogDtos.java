package com.ecommerce.backend.modules.catalog;

import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Request/response payloads for the catalog module (mirrors {@code catalog.validators.ts}). */
public final class CatalogDtos {

    private CatalogDtos() {}

    public record ProductInput(
            @NotBlank(message = "Name is required")
            @Size(min = 1, max = 200, message = "Name must be between 1 and 200 characters")
            String name,
            @Size(max = 500, message = "Summary must be at most 500 characters")
            String summary,
            @Size(max = 50000, message = "Description must be at most 50000 characters")
            String description,
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String brand,
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String category,
            @Size(max = 10, message = "A product can have at most 10 images")
            List<String> images,
            @Size(max = 50, message = "A product can have at most 50 specs")
            List<SpecInput> specs,
            @Size(max = 20, message = "A product can have at most 20 tags")
            List<String> tags,
            @Pattern(regexp = "^(draft|published|archived)$", message = "Invalid product status")
            String status,
            Boolean isActive,
            @NotNull(message = "At least one variant is required")
            @Size(min = 1, max = 100, message = "A product must have between 1 and 100 variants")
            List<VariantInput> variants) {}

    public record ProductUpdate(
            @Size(min = 1, max = 200, message = "Name must be between 1 and 200 characters")
            String name,
            @Size(max = 500, message = "Summary must be at most 500 characters")
            String summary,
            @Size(max = 50000, message = "Description must be at most 50000 characters")
            String description,
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String brand,
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String category,
            @Size(max = 10, message = "A product can have at most 10 images")
            List<String> images,
            @Size(max = 50, message = "A product can have at most 50 specs")
            List<SpecInput> specs,
            @Size(max = 20, message = "A product can have at most 20 tags")
            List<String> tags,
            Boolean isActive,
            @Size(min = 1, max = 100, message = "A product must have between 1 and 100 variants")
            List<VariantInput> variants) {}

    public record SpecInput(
            @NotBlank(message = "Spec key is required")
            @Size(min = 1, max = 100, message = "Spec key must be between 1 and 100 characters")
            String key,
            @NotBlank(message = "Spec value is required")
            @Size(min = 1, max = 500, message = "Spec value must be between 1 and 500 characters")
            String value) {}

    public record VariantInput(
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String id,
            @NotBlank(message = "SKU is required")
            @Size(min = 1, max = 64, message = "SKU must be between 1 and 64 characters")
            String sku,
            Map<String, String> attributes,
            @NotNull(message = "Price is required")
            @Min(value = 0, message = "Price must be a non-negative integer (cents)")
            Long priceCents,
            @Min(value = 0, message = "Compare-at price must be a non-negative integer (cents)")
            Long compareAtPriceCents,
            @Min(value = 0, message = "Tax rate must be at least 0")
            @Max(value = 100, message = "Tax rate must be at most 100")
            Double taxRate,
            @Min(value = 0, message = "Quantity must be a non-negative integer")
            Long quantity,
            @Min(value = 0, message = "Low stock threshold must be a non-negative integer")
            Long lowStockThreshold,
            @Size(max = 10, message = "A variant can have at most 10 images")
            List<String> images,
            Boolean isActive) {}

    public record ProductStatus(
            @NotNull(message = "Status is required")
            @Pattern(regexp = "^(draft|published|archived)$", message = "Invalid product status")
            String status) {}

    public record CategoryInput(
            @NotBlank(message = "Name is required")
            @Size(min = 1, max = 100, message = "Name must be between 1 and 100 characters")
            String name,
            @Pattern(regexp = "^[a-fA-F0-9]{24}$", message = "Invalid identifier format")
            String parent,
            @Size(max = 1000, message = "Description must be at most 1000 characters")
            String description,
            Boolean isActive,
            @Min(value = 0, message = "Order must be a non-negative integer")
            Integer order) {}

    public record BrandInput(
            @NotBlank(message = "Name is required")
            @Size(min = 1, max = 100, message = "Name must be between 1 and 100 characters")
            String name,
            @Size(max = 1000, message = "Description must be at most 1000 characters")
            String description,
            Boolean isActive) {}

    // ---- Public views ----

    public record SpecView(String key, String value) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record StockView(long quantity, long reserved, long available, long lowStockThreshold) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VariantPublic(
            String id,
            String sku,
            Map<String, String> attributes,
            long priceCents,
            Long compareAtPriceCents,
            double taxRate,
            List<String> images,
            boolean isActive,
            Boolean inStock,
            StockView stock) {}

    public record ProductPublic(
            String id,
            String name,
            String slug,
            String summary,
            String description,
            String brand,
            String category,
            List<String> images,
            List<SpecView> specs,
            List<String> tags,
            String status,
            boolean isActive,
            String publishedAt,
            List<VariantPublic> variants,
            Long minPriceCents,
            boolean inStock,
            double averageRating,
            long ratingCount,
            String createdAt,
            String updatedAt) {}

    public record CategoryPublic(
            String id, String name, String slug, String parent, String description, boolean isActive, int order) {}

    public record BrandPublic(String id, String name, String slug, String description, boolean isActive) {}

    // ---- Defaults helper used by the service ----

    public static Map<String, String> attributesOrEmpty(Map<String, String> attributes) {
        return attributes == null ? new LinkedHashMap<>() : attributes;
    }

    public static List<String> stringsOrEmpty(List<String> values) {
        return values == null ? new ArrayList<>() : values;
    }
}
