package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.Role;
import java.util.List;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    List<User> findByRolesInAndStatus(List<Role> roles, String status);
}
