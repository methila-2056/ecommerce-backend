package com.ecommerce.backend.common.api;

/**
 * Consistent success envelope used by every controller:
 * {@code { success, message, data, meta }}. {@code meta} carries
 * pagination/filter info. Mirrors {@code shared/utils/response.ts}.
 */
public record ApiResponse<T>(boolean success, String message, T data, Object meta) {

    public static <T> ApiResponse<T> success(T data, String message) {
        return new ApiResponse<>(true, message, data, null);
    }

    public static <T> ApiResponse<T> success(T data, String message, Object meta) {
        return new ApiResponse<>(true, message, data, meta);
    }
}
