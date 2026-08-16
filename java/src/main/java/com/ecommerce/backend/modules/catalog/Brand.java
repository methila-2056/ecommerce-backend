package com.ecommerce.backend.modules.catalog;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Product brand (collection {@code brands}, mirrors {@code brand.model.ts}). */
@Document(collection = "brands")
public class Brand {

    @Id
    public String id;

    @Indexed(unique = true)
    public String name;

    @Indexed(unique = true)
    public String slug;

    public String description = "";

    public boolean isActive = true;

    public java.time.Instant createdAt;

    public java.time.Instant updatedAt;
}
