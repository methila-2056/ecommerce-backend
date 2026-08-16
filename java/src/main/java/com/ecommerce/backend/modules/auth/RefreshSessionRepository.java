package com.ecommerce.backend.modules.auth;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface RefreshSessionRepository extends MongoRepository<RefreshSession, String> {

    Optional<RefreshSession> findByTokenHash(String tokenHash);
}
