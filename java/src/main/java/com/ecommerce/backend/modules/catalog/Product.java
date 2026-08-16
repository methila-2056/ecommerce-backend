package com.ecommerce.backend.modules.catalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.index.TextIndexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Product (collection {@code products}, mirrors {@code product.model.ts}). */
@Document(collection = "products")
@CompoundIndexes({
    @CompoundIndex(name = "status_isactive_published", def = "{'status':1,'isActive':1,'publishedAt':-1}"),
    @CompoundIndex(name = "category_status", def = "{'category':1,'status':1}"),
    @CompoundIndex(name = "brand_status", def = "{'brand':1,'status':1}")
})
public class Product {

    public static final String STATUS_DRAFT = "draft";
    public static final String STATUS_PUBLISHED = "published";
    public static final String STATUS_ARCHIVED = "archived";

    @Id
    public String id;

    @TextIndexed(weight = 10)
    public String name;

    @Indexed(unique = true)
    public String slug;

    @TextIndexed(weight = 5)
    public String summary = "";

    @TextIndexed(weight = 1)
    public String description = "";

    public String brand;

    public String category;

    public String createdBy;

    public List<String> images = new ArrayList<>();

    public List<Spec> specs = new ArrayList<>();

    @TextIndexed(weight = 3)
    public List<String> tags = new ArrayList<>();

    public String status = STATUS_DRAFT;

    public boolean isActive = true;

    public java.time.Instant publishedAt;

    public List<Variant> variants = new ArrayList<>();

    public double averageRating = 0;

    public long ratingCount = 0;

    public java.time.Instant createdAt;

    public java.time.Instant updatedAt;

    /** Product spec subdocument ({@code specs}). */
    public static class Spec {
        public String key;
        public String value;
    }

    public boolean isPublishedAndActive() {
        return STATUS_PUBLISHED.equals(status) && isActive;
    }
}
