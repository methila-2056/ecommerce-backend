package com.ecommerce.backend.modules.inventory;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface InventoryMovementRepository extends MongoRepository<InventoryMovement, String> {
}
