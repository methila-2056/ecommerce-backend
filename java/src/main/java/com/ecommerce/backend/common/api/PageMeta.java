package com.ecommerce.backend.common.api;

/** Pagination meta (mirrors {@code shared/utils/pagination.ts}). */
public record PageMeta(int page, int limit, long total, int totalPages, boolean hasNextPage, boolean hasPreviousPage) {

    public static PageMeta of(int page, int limit, long total) {
        int totalPages = limit <= 0 ? 0 : (int) Math.ceil((double) total / limit);
        return new PageMeta(
                page,
                limit,
                total,
                totalPages,
                page < totalPages,
                page > 1);
    }
}
