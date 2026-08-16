package com.ecommerce.backend.modules.review;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.review.ReviewDtos.CreateReviewRequest;
import com.ecommerce.backend.modules.review.ReviewDtos.ModerateReviewRequest;
import com.ecommerce.backend.modules.review.ReviewDtos.UpdateReviewRequest;
import com.ecommerce.backend.modules.review.ReviewService.RatingSummary;
import com.ecommerce.backend.modules.review.ReviewService.ReviewListResult;
import com.ecommerce.backend.modules.review.ReviewService.ReviewPublic;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Review endpoints (mirrors {@code review.routes.ts} + {@code review.controller.ts}). */
@RestController
@RequestMapping("/api/v1")
@Validated
public class ReviewController {

    private final ReviewService reviewService;

    public ReviewController(ReviewService reviewService) {
        this.reviewService = reviewService;
    }

    // ------------------------------------------------------- Public listings

    @GetMapping("/products/{productId}/reviews")
    public ResponseEntity<ApiResponse<List<ReviewPublic>>> listReviews(
            @PathVariable String productId,
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        ReviewListResult result = reviewService.listReviews(productId, p, l, null, false);
        return ResponseEntity.ok(
                ApiResponse.success(result.reviews(), "Reviews retrieved successfully", meta(p, l, result.total())));
    }

    @GetMapping("/products/{productId}/reviews/rating")
    public ResponseEntity<ApiResponse<RatingSummary>> ratingSummary(@PathVariable String productId) {
        RatingSummary summary = reviewService.productRatingSummary(productId);
        return ResponseEntity.ok(ApiResponse.success(summary, "Rating summary retrieved successfully"));
    }

    // ------------------------------------------------------------- Customer

    @PostMapping("/products/{productId}/reviews")
    public ResponseEntity<ApiResponse<ReviewPublic>> createReview(
            @PathVariable String productId,
            @Valid @RequestBody CreateReviewRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        ReviewPublic review = reviewService.createReview(current.userId(), productId, body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(review, "Review submitted successfully"));
    }

    @PatchMapping("/reviews/{reviewId}")
    public ResponseEntity<ApiResponse<ReviewPublic>> updateReview(
            @PathVariable String reviewId,
            @Valid @RequestBody UpdateReviewRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        ReviewPublic review = reviewService.updateOwnReview(current.userId(), reviewId, body);
        return ResponseEntity.ok(ApiResponse.success(review, "Review updated successfully"));
    }

    @DeleteMapping("/reviews/{reviewId}")
    public ResponseEntity<ApiResponse<Void>> deleteReview(
            @PathVariable String reviewId, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        reviewService.deleteReview(current.userId(), reviewId, current.isStaff());
        return ResponseEntity.ok(ApiResponse.success(null, "Review deleted successfully"));
    }

    // ------------------------------------------------------------- Moderation

    @GetMapping("/admin/reviews")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<List<ReviewPublic>>> adminListReviews(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String status) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        ReviewListResult result = reviewService.listAllReviews(p, l, status);
        return ResponseEntity.ok(
                ApiResponse.success(result.reviews(), "Reviews retrieved successfully", meta(p, l, result.total())));
    }

    @PatchMapping("/admin/reviews/{reviewId}/moderate")
    @PreAuthorize("hasAnyRole('ADMIN','SUPPORT')")
    public ResponseEntity<ApiResponse<ReviewPublic>> moderateReview(
            @PathVariable String reviewId,
            @Valid @RequestBody ModerateReviewRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        ReviewPublic review = reviewService.moderateReview(
                reviewId, body.action(), body.reason() == null ? "" : body.reason(), current.userId());
        return ResponseEntity.ok(ApiResponse.success(review, "Review moderated successfully"));
    }

    private Map<String, Object> meta(int page, int limit, long total) {
        PageMeta m = PageMeta.of(page, limit, total);
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", m.page());
        metaMap.put("limit", m.limit());
        metaMap.put("total", m.total());
        metaMap.put("totalPages", m.totalPages());
        metaMap.put("hasNextPage", m.hasNextPage());
        metaMap.put("hasPreviousPage", m.hasPreviousPage());
        return metaMap;
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
