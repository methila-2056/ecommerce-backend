package com.ecommerce.backend.modules.catalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Product variant subdocument (mirrors {@code Variant} in {@code product.model.ts}). */
@Document
public class Variant {

    public static final String STATUS_ACTIVE_ANY = "";

    @Id
    public String id;

    @Indexed(unique = true)
    public String sku;

    public Map<String, String> attributes = new LinkedHashMap<>();

    public long priceCents;

    public Long compareAtPriceCents;

    public double taxRate = 0;

    public Stock stock = new Stock();

    public List<String> images = new ArrayList<>();

    public boolean isActive = true;

    public long available() {
        return stock == null ? 0 : stock.available;
    }

    /** Stock counters (mirrors {@code Variant.stock}). */
    public static class Stock {
        public long quantity = 0;
        public long reserved = 0;
        public long available = 0;
        public long lowStockThreshold = 5;
    }
}
