package com.ecommerce.backend.common.api;

/**
 * Parses the shared pagination query params. Defaults page=1 limit=20, hard
 * cap limit &lt;= 100 (mirrors {@code shared/utils/pagination.ts}).
 */
public final class Pagination {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 100;

    private Pagination() {}

    public static int parsePage(String raw) {
        return clampInt(raw, 1, Integer.MAX_VALUE, 1);
    }

    public static int parseLimit(String raw) {
        int value = clampInt(raw, 1, Integer.MAX_VALUE, DEFAULT_LIMIT);
        return Math.min(value, MAX_LIMIT);
    }

    private static int clampInt(String raw, int min, int max, int fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        try {
            int value = Integer.parseInt(raw.trim());
            return Math.max(min, Math.min(value, max));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
