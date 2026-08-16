package com.ecommerce.backend.modules.coupon;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface CouponUsageRepository extends MongoRepository<CouponUsage, String> {

    long countByCouponIdAndUserId(String couponId, String userId);
}
