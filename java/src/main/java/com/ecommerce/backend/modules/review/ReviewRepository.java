package com.ecommerce.backend.modules.review;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ReviewRepository extends MongoRepository<Review, String> {

    Optional<Review> findByProductIdAndUserId(String productId, String userId);

    boolean existsByProductIdAndUserId(String productId, String userId);
}
