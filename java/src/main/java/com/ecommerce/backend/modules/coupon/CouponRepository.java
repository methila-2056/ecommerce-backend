package com.ecommerce.backend.modules.coupon;

import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface CouponRepository extends MongoRepository<Coupon, String> {

    Optional<Coupon> findByCode(String code);
}
