package com.ecommerce.backend.modules.catalog;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.common.util.Slugifier;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.catalog.CatalogDtos.BrandInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.BrandPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.CategoryInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.CategoryPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductPublic;
import com.ecommerce.backend.modules.catalog.CatalogDtos.ProductUpdate;
import com.ecommerce.backend.modules.catalog.CatalogDtos.SpecInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.SpecView;
import com.ecommerce.backend.modules.catalog.CatalogDtos.StockView;
import com.ecommerce.backend.modules.catalog.CatalogDtos.VariantInput;
import com.ecommerce.backend.modules.catalog.CatalogDtos.VariantPublic;
import com.ecommerce.backend.modules.catalog.Product.Spec;
import com.ecommerce.backend.modules.catalog.Variant.Stock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Catalog + inventory business logic (mirrors {@code catalog.service.ts} + {@code product.service.ts}). */
@Service
public class CatalogService {

    private static final Pattern URL_PATTERN =
            Pattern.compile("^(https?)://", Pattern.CASE_INSENSITIVE);

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final BrandRepository brandRepository;
    private final MongoTemplate mongo;
    private final AuditService auditService;

    public CatalogService(
            ProductRepository productRepository,
            CategoryRepository categoryRepository,
            BrandRepository brandRepository,
            MongoTemplate mongo,
            AuditService auditService) {
        this.productRepository = productRepository;
        this.categoryRepository = categoryRepository;
        this.brandRepository = brandRepository;
        this.mongo = mongo;
        this.auditService = auditService;
    }

    // ---------------------------------------------------------------- Search

    public record SearchResult(List<ProductPublic> items, long total) {}

    /**
     * Public product search. Filters are ANDed. Keyword uses the MongoDB $text
     * index; minPrice/maxPrice operate on the lowest active-variant price.
     */
    public SearchResult searchPublic(
            int page,
            int limit,
            String keyword,
            String category,
            String brand,
            Long minPrice,
            Long maxPrice,
            Double rating,
            Boolean inStock,
            String sort) {
        List<Document> match = new ArrayList<>();
        match.add(new Document("status", Product.STATUS_PUBLISHED));
        match.add(new Document("isActive", true));
        applyFilters(match, keyword, category, brand, minPrice, maxPrice, rating, inStock);

        long total = count(match);
        List<Product> products = runSearch(match, sort, keyword, (page - 1) * limit, limit);
        List<ProductPublic> items = products.stream()
                .map(p -> toProductPublic(p, false))
                .toList();
        return new SearchResult(items, total);
    }

    /** Admin product search. {@code status} is optional; {@code includeInactive} lifts the active filter. */
    public SearchResult searchAdmin(
            int page,
            int limit,
            String keyword,
            String status,
            String category,
            String brand,
            Long minPrice,
            Long maxPrice,
            Double rating,
            Boolean inStock,
            Boolean includeInactive,
            String sort) {
        List<Document> match = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            match.add(new Document("status", status));
        }
        if (includeInactive == null || !includeInactive) {
            match.add(new Document("isActive", true));
        }
        applyFilters(match, keyword, category, brand, minPrice, maxPrice, rating, inStock);

        long total = count(match);
        List<Product> products = runSearch(match, sort, keyword, (page - 1) * limit, limit);
        List<ProductPublic> items = products.stream()
                .map(p -> toProductPublic(p, true))
                .toList();
        return new SearchResult(items, total);
    }

    private void applyFilters(
            List<Document> match,
            String keyword,
            String category,
            String brand,
            Long minPrice,
            Long maxPrice,
            Double rating,
            Boolean inStock) {
        if (keyword != null && !keyword.isBlank()) {
            match.add(new Document("$text", new Document("$search", keyword.trim())));
        }
        if (category != null && !category.isBlank()) {
            match.add(new Document("category", category));
        }
        if (brand != null && !brand.isBlank()) {
            match.add(new Document("brand", brand));
        }
        if (minPrice != null) {
            match.add(new Document("minPriceCents", new Document("$gte", minPrice)));
        }
        if (maxPrice != null) {
            match.add(new Document("minPriceCents", new Document("$lte", maxPrice)));
        }
        if (rating != null) {
            match.add(new Document("averageRating", new Document("$gte", rating)));
        }
        if (Boolean.TRUE.equals(inStock)) {
            match.add(new Document("variants", new Document(
                    "$elemMatch",
                    new Document("isActive", true).append("stock.available", new Document("$gt", 0)))));
        }
    }

    private long count(List<Document> match) {
        List<AggregationOperation> ops = new ArrayList<>();
        if (!match.isEmpty()) {
            ops.add(ctx -> new Document("$match", matchDocument(match)));
        }
        ops.add(Aggregation.count().as("total"));
        AggregationResults<Document> result = mongo.aggregate(
                Aggregation.newAggregation(Product.class, ops), Document.class);
        if (result.getMappedResults().isEmpty()) {
            return 0;
        }
        return result.getMappedResults().get(0).get("total", Number.class).longValue();
    }

    private List<Product> runSearch(
            List<Document> match, String sort, String keyword, long skip, long limit) {
        List<AggregationOperation> ops = new ArrayList<>();
        if (!match.isEmpty()) {
            ops.add(ctx -> new Document("$match", matchDocument(match)));
        }
        appendSort(ops, sort, keyword);
        ops.add(Aggregation.skip(skip));
        ops.add(Aggregation.limit(limit));
        AggregationResults<Product> result =
                mongo.aggregate(Aggregation.newAggregation(Product.class, ops), Product.class);
        return result.getMappedResults();
    }

    private void appendSort(List<AggregationOperation> ops, String sort, String keyword) {
        if ("price_asc".equals(sort)) {
            ops.add(Aggregation.sort(Sort.by(Sort.Direction.ASC, "minPriceCents")));
        } else if ("price_desc".equals(sort)) {
            ops.add(Aggregation.sort(Sort.by(Sort.Direction.DESC, "minPriceCents")));
        } else if ("oldest".equals(sort)) {
            ops.add(Aggregation.sort(Sort.by(Sort.Direction.ASC, "createdAt")));
        } else if ("rating".equals(sort)) {
            ops.add(Aggregation.sort(Sort.by(Sort.Direction.DESC, "averageRating")
                    .and(Sort.by(Sort.Direction.DESC, "ratingCount"))));
        } else if ("relevance".equals(sort) && keyword != null && !keyword.isBlank()) {
            ops.add(ctx -> new Document(
                    "$sort", new Document("score", new Document("$meta", "textScore"))));
        } else {
            ops.add(Aggregation.sort(Sort.by(Sort.Direction.DESC, "createdAt")));
        }
    }

    // --------------------------------------------------------------- Products

    public ProductPublic getProductBySlug(String slug) {
        Product product = productRepository
                .findBySlug(slug)
                .filter(Product::isPublishedAndActive)
                .orElseThrow(() -> ApiException.notFound("Product not found"));
        return toProductPublic(product, false);
    }

    public ProductPublic adminGetProduct(String id, boolean includeInactive) {
        Product product = requireProduct(id);
        if (!includeInactive && !Product.STATUS_PUBLISHED.equals(product.status)) {
            throw ApiException.notFound("Product not found");
        }
        return toProductPublic(product, true);
    }

    @Transactional
    public ProductPublic createProduct(ProductInput input, String actorId, String ip) {
        if (input.brand() != null && !input.brand().isBlank()
                && !brandRepository.existsById(input.brand())) {
            throw ApiException.badRequest("Brand does not exist", "BRAND_NOT_FOUND");
        }
        if (input.category() != null && !input.category().isBlank()
                && !categoryRepository.existsById(input.category())) {
            throw ApiException.badRequest("Category does not exist", "CATEGORY_NOT_FOUND");
        }

        Product product = new Product();
        product.name = input.name().trim();
        product.slug = uniqueSlug(Slugifier.slugify(product.name));
        product.summary = input.summary() == null ? "" : input.summary().trim();
        product.description = input.description() == null ? "" : input.description().trim();
        product.brand = blankToNull(input.brand());
        product.category = blankToNull(input.category());
        product.images = validateImages(input.images());
        product.specs = buildSpecs(input.specs());
        product.tags = buildTags(input.tags());
        product.isActive = input.isActive() == null ? true : input.isActive();
        product.status = input.status() == null ? Product.STATUS_DRAFT : input.status();
        product.publishedAt =
                Product.STATUS_PUBLISHED.equals(product.status) ? Instant.now() : null;
        product.variants = buildVariants(input.variants(), new ArrayList<>());
        product.createdBy = actorId;
        product.createdAt = Instant.now();
        product.updatedAt = product.createdAt;

        Product saved = productRepository.save(product);
        auditService.log("product.created", actorId, ip, Map.of("productId", saved.id, "slug", saved.slug));
        return toProductPublic(saved, true);
    }

    @Transactional
    public ProductPublic updateProduct(String id, ProductUpdate input, String actorId, String ip) {
        Product product = requireProduct(id);
        if (Product.STATUS_ARCHIVED.equals(product.status)) {
            throw ApiException.badRequest(
                    "Archived products cannot be edited", "PRODUCT_ARCHIVED");
        }
        if (Product.STATUS_PUBLISHED.equals(product.status) && input.variants() != null) {
            throw ApiException.badRequest(
                    "Unpublish the product before changing variants",
                    "VARIANTS_LOCKED_WHILE_PUBLISHED");
        }
        if (input.brand() != null && !input.brand().isBlank()
                && !brandRepository.existsById(input.brand())) {
            throw ApiException.badRequest("Brand does not exist", "BRAND_NOT_FOUND");
        }
        if (input.category() != null && !input.category().isBlank()
                && !categoryRepository.existsById(input.category())) {
            throw ApiException.badRequest("Category does not exist", "CATEGORY_NOT_FOUND");
        }

        if (input.name() != null && !input.name().trim().equals(product.name)) {
            product.name = input.name().trim();
            product.slug = uniqueSlug(Slugifier.slugify(product.name));
        }
        if (input.summary() != null) {
            product.summary = input.summary().trim();
        }
        if (input.description() != null) {
            product.description = input.description().trim();
        }
        if (input.brand() != null) {
            product.brand = blankToNull(input.brand());
        }
        if (input.category() != null) {
            product.category = blankToNull(input.category());
        }
        if (input.images() != null) {
            product.images = validateImages(input.images());
        }
        if (input.specs() != null) {
            product.specs = buildSpecs(input.specs());
        }
        if (input.tags() != null) {
            product.tags = buildTags(input.tags());
        }
        if (input.isActive() != null) {
            product.isActive = input.isActive();
        }
        if (input.variants() != null) {
            product.variants = buildVariants(input.variants(), product.variants);
        }
        product.updatedAt = Instant.now();

        Product saved = productRepository.save(product);
        auditService.log("product.updated", actorId, ip, Map.of("productId", saved.id, "slug", saved.slug));
        return toProductPublic(saved, true);
    }

    @Transactional
    public ProductPublic setProductStatus(String id, String status, String actorId, String ip) {
        Product product = requireProduct(id);
        product.status = status;
        if (Product.STATUS_PUBLISHED.equals(status) && product.publishedAt == null) {
            product.publishedAt = Instant.now();
        } else if (Product.STATUS_DRAFT.equals(status)) {
            product.publishedAt = null;
        } else if (Product.STATUS_ARCHIVED.equals(status)) {
            product.isActive = false;
            product.publishedAt = null;
        }
        product.updatedAt = Instant.now();
        Product saved = productRepository.save(product);
        auditService.log("product.updated", actorId, ip, Map.of("productId", saved.id, "slug", saved.slug));
        return toProductPublic(saved, true);
    }

    @Transactional
    public void archiveProduct(String id, String actorId, String ip) {
        Product product = requireProduct(id);
        product.status = Product.STATUS_ARCHIVED;
        product.isActive = false;
        product.publishedAt = null;
        product.updatedAt = Instant.now();
        productRepository.save(product);
        auditService.log("product.deleted", actorId, ip, Map.of("productId", id, "slug", product.slug));
    }

    private Product requireProduct(String id) {
        if (!ObjectId.isValid(id)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return productRepository.findById(id).orElseThrow(() -> ApiException.notFound("Product not found"));
    }

    private String uniqueSlug(String base) {
        String baseSlug = base == null || base.isBlank() ? "product" : base;
        String slug = baseSlug;
        int suffix = 1;
        while (productRepository.existsBySlug(slug)) {
            if (suffix <= 999) {
                slug = baseSlug + "-" + suffix++;
            } else {
                slug = baseSlug + "-" + Long.toString(System.currentTimeMillis(), 36);
            }
        }
        return slug;
    }

    private List<Product.Spec> buildSpecs(List<SpecInput> inputs) {
        List<Product.Spec> specs = new ArrayList<>();
        if (inputs == null) {
            return specs;
        }
        for (SpecInput spec : inputs) {
            if (spec.key() == null || spec.key().isBlank()) {
                throw ApiException.badRequest("Spec key is required", "BAD_REQUEST");
            }
            if (spec.key().length() > 100) {
                throw ApiException.badRequest(
                        "Spec key must be between 1 and 100 characters", "BAD_REQUEST");
            }
            if (spec.value() == null || spec.value().isBlank()) {
                throw ApiException.badRequest("Spec value is required", "BAD_REQUEST");
            }
            if (spec.value().length() > 500) {
                throw ApiException.badRequest(
                        "Spec value must be between 1 and 500 characters", "BAD_REQUEST");
            }
            Spec entry = new Spec();
            entry.key = spec.key().trim();
            entry.value = spec.value().trim();
            specs.add(entry);
        }
        return specs;
    }

    private List<String> buildTags(List<String> tags) {
        List<String> result = new ArrayList<>();
        if (tags == null) {
            return result;
        }
        for (String tag : tags) {
            if (tag == null || tag.isBlank()) {
                continue;
            }
            String trimmed = tag.trim();
            if (trimmed.length() > 50) {
                throw ApiException.badRequest(
                        "Tags must be between 1 and 50 characters", "BAD_REQUEST");
            }
            result.add(trimmed);
        }
        if (result.size() > 20) {
            throw ApiException.badRequest("A product can have at most 20 tags", "BAD_REQUEST");
        }
        return result;
    }

    private List<String> validateImages(List<String> images) {
        List<String> result = new ArrayList<>();
        if (images == null) {
            return result;
        }
        for (String image : images) {
            if (image == null || !URL_PATTERN.matcher(image).find()) {
                throw ApiException.badRequest("Images must be valid URLs", "BAD_REQUEST");
            }
            result.add(image);
        }
        if (result.size() > 10) {
            throw ApiException.badRequest("A product can have at most 10 images", "BAD_REQUEST");
        }
        return result;
    }

    /**
     * Full-replacement variant sync: entries with an {@code id} update the
     * matching existing variant (stock counters preserved), new entries are
     * appended, existing variants absent from the input are removed.
     */
    private List<Variant> buildVariants(List<VariantInput> inputs, List<Variant> existing) {
        List<Variant> variants = new ArrayList<>();
        if (inputs == null) {
            return variants;
        }
        List<String> skus = new ArrayList<>();
        for (VariantInput v : inputs) {
            Variant variant = null;
            if (v.id() != null && !v.id().isBlank()) {
                for (Variant candidate : existing) {
                    if (v.id().equals(candidate.id)) {
                        variant = candidate;
                        break;
                    }
                }
                if (variant == null) {
                    throw ApiException.badRequest("Variant not found", "VARIANT_NOT_FOUND");
                }
            } else {
                variant = new Variant();
                variant.id = new ObjectId().toHexString();
            }

            String sku = v.sku().trim().toUpperCase();
            if (skus.contains(sku)) {
                throw ApiException.badRequest("Duplicate SKU in variants", "DUPLICATE_SKU");
            }
            skus.add(sku);

            variant.sku = sku;
            variant.attributes = validateAttributes(v.attributes());
            variant.priceCents = v.priceCents();
            variant.compareAtPriceCents = v.compareAtPriceCents();
            variant.taxRate = v.taxRate() == null ? 0 : v.taxRate();
            variant.images = validateImages(v.images());
            variant.isActive = v.isActive() == null ? true : v.isActive();

            if (variant.stock == null) {
                variant.stock = new Stock();
            }
            if (v.lowStockThreshold() != null) {
                variant.stock.lowStockThreshold = v.lowStockThreshold();
            }
            if (isNewVariant(v, existing)) {
                variant.stock.reserved = 0;
                variant.stock.available = 0;
                variant.stock.quantity = 0;
                if (v.quantity() != null) {
                    variant.stock.quantity = v.quantity();
                    variant.stock.available = v.quantity();
                }
            }
            variants.add(variant);
        }
        return variants;
    }

    private boolean isNewVariant(VariantInput v, List<Variant> existing) {
        if (v.id() == null || v.id().isBlank()) {
            return true;
        }
        return existing.stream().noneMatch(e -> v.id().equals(e.id));
    }

    private Map<String, String> validateAttributes(Map<String, String> attributes) {
        Map<String, String> result = new LinkedHashMap<>();
        if (attributes == null) {
            return result;
        }
        for (Map.Entry<String, String> entry : attributes.entrySet()) {
            if (entry.getKey() == null || entry.getKey().isBlank() || entry.getKey().length() > 100) {
                throw ApiException.badRequest(
                        "Attribute keys must be between 1 and 100 characters", "BAD_REQUEST");
            }
            if (entry.getValue() == null || entry.getValue().length() > 100) {
                throw ApiException.badRequest(
                        "Attribute values must be between 1 and 100 characters", "BAD_REQUEST");
            }
            result.put(entry.getKey().trim(), entry.getValue());
        }
        return result;
    }

    // ------------------------------------------------------------ Categories

    public List<CategoryPublic> listCategories() {
        return categoryRepository.findAll().stream()
                .sorted(Comparator.comparingInt((Category c) -> c.order)
                        .thenComparing((Category c) -> c.name, String.CASE_INSENSITIVE_ORDER))
                .map(c -> new CategoryPublic(
                        c.id, c.name, c.slug, c.parent, orEmpty(c.description), c.isActive, c.order))
                .toList();
    }

    @Transactional
    public CategoryPublic createCategory(CategoryInput input, String actorId, String ip) {
        Category category = new Category();
        category.name = input.name().trim();
        category.slug = Slugifier.slugify(category.name);
        if (input.parent() != null && !input.parent().isBlank()) {
            if (!categoryRepository.existsById(input.parent())) {
                throw ApiException.badRequest("Parent category does not exist", "PARENT_NOT_FOUND");
            }
            category.parent = input.parent();
        }
        category.description = input.description() == null ? "" : input.description().trim();
        category.isActive = input.isActive() == null ? true : input.isActive();
        category.order = input.order() == null ? 0 : input.order();
        category.createdAt = Instant.now();
        category.updatedAt = category.createdAt;

        Category saved = categoryRepository.save(category);
        auditService.log("category.created", actorId, ip, Map.of("categoryId", saved.id, "slug", saved.slug));
        return toCategoryPublic(saved);
    }

    @Transactional
    public CategoryPublic updateCategory(String id, CategoryInput input, String actorId, String ip) {
        Category category = requireCategory(id);
        if (input.name() != null && !input.name().trim().equals(category.name)) {
            category.name = input.name().trim();
            category.slug = Slugifier.slugify(category.name);
        }
        if (input.parent() != null) {
            if (id.equals(input.parent())) {
                throw ApiException.badRequest(
                        "A category cannot be its own parent", "INVALID_PARENT");
            }
            if (!categoryRepository.existsById(input.parent())) {
                throw ApiException.badRequest("Parent category does not exist", "PARENT_NOT_FOUND");
            }
            category.parent = input.parent();
        }
        if (input.description() != null) {
            category.description = input.description().trim();
        }
        if (input.isActive() != null) {
            category.isActive = input.isActive();
        }
        if (input.order() != null) {
            category.order = input.order();
        }
        category.updatedAt = Instant.now();
        Category saved = categoryRepository.save(category);
        auditService.log("category.updated", actorId, ip, Map.of("categoryId", saved.id, "slug", saved.slug));
        return toCategoryPublic(saved);
    }

    @Transactional
    public void deleteCategory(String id, String actorId, String ip) {
        Category category = requireCategory(id);
        if (!categoryRepository.findByParent(id).isEmpty()) {
            throw ApiException.badRequest(
                    "Delete child categories first", "CATEGORY_HAS_CHILDREN");
        }
        boolean inUse = mongo.exists(
                org.springframework.data.mongodb.core.query.Query.query(
                        org.springframework.data.mongodb.core.query.Criteria.where("category")
                                .is(id)
                                .and("status")
                                .ne(Product.STATUS_ARCHIVED)),
                Product.class);
        if (inUse) {
            throw ApiException.badRequest(
                    "Category is used by active products", "CATEGORY_IN_USE");
        }
        categoryRepository.delete(category);
        auditService.log("category.deleted", actorId, ip, Map.of("categoryId", id, "slug", category.slug));
    }

    private Category requireCategory(String id) {
        if (!ObjectId.isValid(id)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return categoryRepository
                .findById(id)
                .orElseThrow(() -> ApiException.notFound("Category not found"));
    }

    private CategoryPublic toCategoryPublic(Category c) {
        return new CategoryPublic(
                c.id, c.name, c.slug, c.parent, orEmpty(c.description), c.isActive, c.order);
    }

    // ----------------------------------------------------------------- Brands

    public List<BrandPublic> listBrands() {
        return brandRepository.findAllByOrderByNameAsc().stream()
                .map(b -> new BrandPublic(b.id, b.name, b.slug, orEmpty(b.description), b.isActive))
                .toList();
    }

    @Transactional
    public BrandPublic createBrand(BrandInput input, String actorId, String ip) {
        Brand brand = new Brand();
        brand.name = input.name().trim();
        brand.slug = Slugifier.slugify(brand.name);
        brand.description = input.description() == null ? "" : input.description().trim();
        brand.isActive = input.isActive() == null ? true : input.isActive();
        brand.createdAt = Instant.now();
        brand.updatedAt = brand.createdAt;

        Brand saved = brandRepository.save(brand);
        auditService.log("brand.created", actorId, ip, Map.of("brandId", saved.id, "slug", saved.slug));
        return toBrandPublic(saved);
    }

    @Transactional
    public BrandPublic updateBrand(String id, BrandInput input, String actorId, String ip) {
        Brand brand = requireBrand(id);
        if (input.name() != null && !input.name().trim().equals(brand.name)) {
            brand.name = input.name().trim();
            brand.slug = Slugifier.slugify(brand.name);
        }
        if (input.description() != null) {
            brand.description = input.description().trim();
        }
        if (input.isActive() != null) {
            brand.isActive = input.isActive();
        }
        brand.updatedAt = Instant.now();
        Brand saved = brandRepository.save(brand);
        auditService.log("brand.updated", actorId, ip, Map.of("brandId", saved.id, "slug", saved.slug));
        return toBrandPublic(saved);
    }

    @Transactional
    public void deleteBrand(String id, String actorId, String ip) {
        Brand brand = requireBrand(id);
        boolean inUse = mongo.exists(
                org.springframework.data.mongodb.core.query.Query.query(
                        org.springframework.data.mongodb.core.query.Criteria.where("brand")
                                .is(id)
                                .and("status")
                                .ne(Product.STATUS_ARCHIVED)),
                Product.class);
        if (inUse) {
            throw ApiException.badRequest("Brand is used by active products", "BRAND_IN_USE");
        }
        brandRepository.delete(brand);
        auditService.log("brand.deleted", actorId, ip, Map.of("brandId", id, "slug", brand.slug));
    }

    private Brand requireBrand(String id) {
        if (!ObjectId.isValid(id)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return brandRepository.findById(id).orElseThrow(() -> ApiException.notFound("Brand not found"));
    }

    private BrandPublic toBrandPublic(Brand b) {
        return new BrandPublic(b.id, b.name, b.slug, orEmpty(b.description), b.isActive);
    }

    // ------------------------------------------------------------- Serializer

    public ProductPublic toProductPublic(Product p, boolean includeStock) {
        List<VariantPublic> variants = new ArrayList<>();
        for (Variant v : p.variants) {
            boolean available = v.isActive && v.available() > 0;
            variants.add(new VariantPublic(
                    v.id,
                    v.sku,
                    v.attributes == null ? Map.of() : v.attributes,
                    v.priceCents,
                    v.compareAtPriceCents,
                    v.taxRate,
                    v.images == null ? List.of() : v.images,
                    v.isActive,
                    includeStock ? null : available,
                    includeStock
                            ? new StockView(
                                    v.stock.quantity,
                                    v.stock.reserved,
                                    v.stock.available,
                                    v.stock.lowStockThreshold)
                            : null));
        }
        Long minPrice = p.variants.stream()
                .filter(v -> v.isActive)
                .map(v -> v.priceCents)
                .min(Long::compareTo)
                .orElse(null);
        boolean inStock = p.variants.stream().anyMatch(v -> v.isActive && v.available() > 0);
        List<SpecView> specs = p.specs == null
                ? List.of()
                : p.specs.stream().map(s -> new SpecView(s.key, s.value)).toList();
        return new ProductPublic(
                p.id,
                p.name,
                p.slug,
                orEmpty(p.summary),
                orEmpty(p.description),
                p.brand,
                p.category,
                p.images == null ? List.of() : p.images,
                specs,
                p.tags == null ? List.of() : p.tags,
                p.status,
                p.isActive,
                iso(p.publishedAt),
                variants,
                minPrice,
                inStock,
                p.averageRating,
                p.ratingCount,
                iso(p.createdAt),
                iso(p.updatedAt));
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }

    private static Document matchDocument(List<Document> clauses) {
        Document document = new Document();
        for (Document clause : clauses) {
            document.putAll(clause);
        }
        return document;
    }

    private static String orEmpty(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
