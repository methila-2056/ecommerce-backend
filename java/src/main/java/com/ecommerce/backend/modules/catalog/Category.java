package com.ecommerce.backend.modules.catalog;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Product category (collection {@code categories}, mirrors {@code category.model.ts}). */
@Document(collection = "categories")
public class Category {

    @Id
    public String id;

    @Indexed(unique = true)
    public String name;

    @Indexed(unique = true)
    public String slug;

    @Indexed
    public String parent;

    public String description = "";

    public boolean isActive = true;

    public int order = 0;

    public java.time.Instant createdAt;

    public java.time.Instant updatedAt;
}
