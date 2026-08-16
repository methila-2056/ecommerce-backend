package com.ecommerce.backend.modules.review;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request payloads for the review module (mirrors {@code review.validators.ts}). */
public final class ReviewDtos {

    private ReviewDtos() {}

    public record CreateReviewRequest(
            @Min(value = Review.MIN_RATING, message = "Rating must be between 1 and 5")
            @Max(value = Review.MAX_RATING, message = "Rating must be between 1 and 5")
            int rating,
            @Size(max = 120, message = "Title must be at most 120 characters")
            String title,
            @NotBlank(message = "Review body is required")
            @Size(min = 1, max = 2000, message = "Review body must be between 1 and 2000 characters")
            String body) {}

    public record UpdateReviewRequest(
            @Min(value = Review.MIN_RATING, message = "Rating must be between 1 and 5")
            @Max(value = Review.MAX_RATING, message = "Rating must be between 1 and 5")
            Integer rating,
            @Size(max = 120, message = "Title must be at most 120 characters")
            String title,
            @Size(min = 1, max = 2000, message = "Review body must be between 1 and 2000 characters")
            String body) {}

    public record ModerateReviewRequest(
            @NotBlank(message = "Action is required")
            @Pattern(regexp = "^(approve|reject)$", message = "Action must be approve or reject")
            String action,
            @Size(max = 500, message = "Reason must be at most 500 characters")
            String reason) {}
}
