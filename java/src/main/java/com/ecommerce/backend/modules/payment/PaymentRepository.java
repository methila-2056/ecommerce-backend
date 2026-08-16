package com.ecommerce.backend.modules.payment;

import org.springframework.data.mongodb.repository.MongoRepository;

public interface PaymentRepository extends MongoRepository<Payment, String> {

    java.util.Optional<Payment> findFirstByOrderIdAndStatusInOrderByCreatedAtDesc(
            String orderId, java.util.Collection<String> statuses);

    java.util.Optional<Payment> findFirstByOrderIdOrderByCreatedAtDesc(String orderId);

    java.util.Optional<Payment> findFirstByIdempotencyKeyOrderByCreatedAtDesc(String idempotencyKey);

    java.util.Optional<Payment> findFirstByProviderAndProviderReference(
            String provider, String providerReference);
}
