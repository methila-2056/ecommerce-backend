package com.ecommerce.backend.modules.wishlist;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface WishlistRepository extends MongoRepository<Wishlist, String> {

    Optional<Wishlist> findByUserId(String userId);

    void deleteByUserId(String userId);
}
