package com.ecommerce.backend.modules.inventory;

import java.time.Instant;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** Immutable stock movement (collection {@code inventorymovements}, mirrors {@code inventory.model.ts}). */
@Document(collection = "inventorymovements")
@CompoundIndexes({
    @CompoundIndex(name = "product_variant_time", def = "{'productId':1,'variantId':1,'createdAt':-1}")
})
public class InventoryMovement {

    public static final String TYPE_RESTOCK = "restock";
    public static final String TYPE_RESERVATION = "reservation";
    public static final String TYPE_RELEASE = "release";
    public static final String TYPE_SALE = "sale";
    public static final String TYPE_ADJUSTMENT = "adjustment";
    public static final String TYPE_RETURN = "return";

    @Id
    public String id;

    public String productId;

    public String variantId;

    public String sku;

    @Indexed
    public String type;

    public long quantity;

    public Long beforeAvailable;

    public Long afterAvailable;

    public String reason = "";

    public String referenceType;

    @Indexed
    public String referenceId;

    public String actorId;

    public Instant createdAt;
}
