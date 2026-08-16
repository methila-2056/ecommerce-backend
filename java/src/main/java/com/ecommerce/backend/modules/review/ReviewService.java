package com.ecommerce.backend.modules.review;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.catalog.Product;
import com.ecommerce.backend.modules.order.Order;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationResults;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/** Review lifecycle (mirrors {@code review.service.ts}). */
@Service
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final MongoTemplate mongo;
    private final AuditService auditService;

    public ReviewService(
            ReviewRepository reviewRepository,
            UserRepository userRepository,
            MongoTemplate mongo,
            AuditService auditService) {
        this.reviewRepository = reviewRepository;
        this.userRepository = userRepository;
        this.mongo = mongo;
        this.auditService = auditService;
    }

    // -------------------------------------------------------------- Public shapes

    public record ReviewPublic(
            String id,
            String productId,
            String userId,
            String reviewerName,
            int rating,
            String title,
            String body,
            boolean isVerifiedPurchase,
            String status,
            String moderationReason,
            String createdAt,
            String updatedAt) {}

    public record ReviewListResult(List<ReviewPublic> reviews, long total) {}

    public record RatingSummary(double average, long count, Map<Integer, Integer> distribution) {}

    // ----------------------------------------------------------------- Create

    public ReviewPublic createReview(String userId, String productId, ReviewDtos.CreateReviewRequest input) {
        Product product = mongo.findOne(
                Query.query(Criteria.where("_id")
                        .is(productId)
                        .and("status")
                        .is(Product.STATUS_PUBLISHED)
                        .and("isActive")
                        .is(true)),
                Product.class);
        if (product == null) {
            throw ApiException.notFound("Product not found");
        }

        if (reviewRepository.existsByProductIdAndUserId(productId, userId)) {
            throw ApiException.conflict(
                    "You have already reviewed this product", "REVIEW_EXISTS");
        }

        Order verifiedOrder = mongo.findOne(
                Query.query(Criteria.where("userId")
                        .is(userId)
                        .and("status")
                        .is(Order.STATUS_DELIVERED)
                        .and("items.productId")
                        .is(productId)),
                Order.class);

        Review review = new Review();
        review.productId = productId;
        review.userId = userId;
        review.orderId = verifiedOrder == null ? null : verifiedOrder.id;
        review.rating = input.rating();
        review.title = input.title() == null ? "" : input.title().trim();
        review.body = input.body().trim();
        review.isVerifiedPurchase = verifiedOrder != null;
        review.status = verifiedOrder == null ? Review.STATUS_PENDING : Review.STATUS_APPROVED;
        review.createdAt = Instant.now();
        review.updatedAt = review.createdAt;
        Review saved = reviewRepository.insert(review);

        auditService.log("review.created", userId, null,
                Map.of("reviewId", saved.id, "productId", productId));
        return toReviewPublic(saved, null);
    }

    // ------------------------------------------------------------- Own review

    public ReviewPublic updateOwnReview(String userId, String reviewId, ReviewDtos.UpdateReviewRequest input) {
        if (input.rating() == null && input.title() == null && input.body() == null) {
            throw ApiException.badRequest("At least one field is required", "BAD_REQUEST");
        }
        Review review = findOneByUser(reviewId, userId);
        if (input.rating() != null) {
            review.rating = input.rating();
        }
        if (input.title() != null) {
            review.title = input.title().trim();
        }
        if (input.body() != null) {
            review.body = input.body().trim();
        }
        review.updatedAt = Instant.now();
        Review saved = reviewRepository.save(review);
        auditService.log("review.updated", userId, null, Map.of("reviewId", reviewId));
        return toReviewPublic(saved, reviewerName(userId));
    }

    public void deleteReview(String userId, String reviewId, boolean isStaff) {
        Review review = isStaff
                ? findReview(reviewId)
                : findOneByUser(reviewId, userId);
        reviewRepository.delete(review);
        auditService.log("review.deleted", userId, null, Map.of("reviewId", reviewId));
    }

    // ----------------------------------------------------------------- Reads

    public ReviewListResult listReviews(String productId, int page, int limit, String status, boolean isStaff) {
        Query query = new Query(Criteria.where("productId").is(productId));
        if (isStaff) {
            if (status != null && !status.isBlank()) {
                query.addCriteria(Criteria.where("status").is(status));
            }
        } else {
            query.addCriteria(Criteria.where("status").is(Review.STATUS_APPROVED));
        }
        return listWithNames(query, page, limit);
    }

    public ReviewListResult listAllReviews(int page, int limit, String status) {
        Query query = new Query();
        if (status != null && !status.isBlank()) {
            query.addCriteria(Criteria.where("status").is(status));
        }
        return listWithNames(query, page, limit);
    }

    private ReviewListResult listWithNames(Query query, int page, int limit) {
        long total = mongo.count(query, Review.class);
        query.with(Sort.by(Sort.Direction.DESC, "createdAt"))
                .skip((long) (page - 1) * limit)
                .limit(limit);
        List<Review> reviews = mongo.find(query, Review.class);
        Map<String, String> nameById = namesFor(reviews.stream().map(r -> r.userId).toList());
        return new ReviewListResult(
                reviews.stream().map(r -> toReviewPublic(r, nameById.get(r.userId))).toList(),
                total);
    }

    public RatingSummary productRatingSummary(String productId) {
        Aggregation aggregation = Aggregation.newAggregation(
                Aggregation.match(Criteria.where("productId")
                        .is(productId)
                        .and("status")
                        .is(Review.STATUS_APPROVED)),
                Aggregation.group("rating").count().as("count"));
        AggregationResults<Document> results = mongo.aggregate(aggregation, Review.class, Document.class);

        Map<Integer, Integer> distribution = new LinkedHashMap<>();
        for (int i = 1; i <= Review.MAX_RATING; i++) {
            distribution.put(i, 0);
        }
        long count = 0;
        long weighted = 0;
        for (Document row : results.getMappedResults()) {
            int rating = ((Number) row.get("_id")).intValue();
            int rowCount = ((Number) row.get("count")).intValue();
            distribution.put(rating, rowCount);
            count += rowCount;
            weighted += (long) rating * rowCount;
        }
        double average = count > 0 ? (double) weighted / count : 0;
        return new RatingSummary(average, count, distribution);
    }

    // ------------------------------------------------------------ Moderation

    public ReviewPublic moderateReview(String reviewId, String action, String reason, String actorId) {
        Review review = findReview(reviewId);
        review.status = "approve".equals(action) ? Review.STATUS_APPROVED : Review.STATUS_REJECTED;
        review.moderationReason = "reject".equals(action)
                ? (reason == null || reason.isBlank() ? "Rejected by moderator" : reason)
                : null;
        review.updatedAt = Instant.now();
        Review saved = reviewRepository.save(review);
        auditService.log("review.moderated", actorId, null,
                Map.of("reviewId", reviewId, "action", action, "reason", reason == null ? "" : reason));
        return toReviewPublic(saved, reviewerName(saved.userId));
    }

    // -------------------------------------------------------------- Internals

    private Review findReview(String reviewId) {
        if (!ObjectId.isValid(reviewId)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return reviewRepository.findById(reviewId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
    }

    private Review findOneByUser(String reviewId, String userId) {
        Review review = findReview(reviewId);
        if (!userId.equals(review.userId)) {
            throw ApiException.notFound("Review not found");
        }
        return review;
    }

    private String reviewerName(String userId) {
        if (userId == null) {
            return "Anonymous";
        }
        return userRepository.findById(userId).map(u -> u.name).orElse("Anonymous");
    }

    private Map<String, String> namesFor(List<String> userIds) {
        List<String> distinct = userIds.stream().distinct().toList();
        if (distinct.isEmpty()) {
            return Map.of();
        }
        Map<String, String> names = new java.util.HashMap<>();
        for (User u : userRepository.findAllById(distinct)) {
            names.put(u.id, u.name == null ? "" : u.name);
        }
        return names;
    }

    private ReviewPublic toReviewPublic(Review r, String reviewerName) {
        return new ReviewPublic(
                r.id,
                r.productId,
                r.userId,
                reviewerName == null || reviewerName.isBlank() ? "Anonymous" : reviewerName,
                r.rating,
                r.title == null ? "" : r.title,
                r.body,
                r.isVerifiedPurchase,
                r.status,
                r.moderationReason,
                iso(r.createdAt),
                iso(r.updatedAt));
    }

    private static String iso(Instant value) {
        return value == null ? null : value.toString();
    }
}
