package com.ecommerce.backend.modules.notification;

import java.time.Instant;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;

public interface NotificationRepository extends MongoRepository<Notification, String> {

    long countByUserIdAndReadAtIsNull(String userId);

    @Query(value = "{'type': ?0, 'data.sku': ?1, 'createdAt': {'$gte': ?2}}", count = true)
    long countByTypeAndDataSkuSince(String type, String sku, Instant since);
}
