package com.ecommerce.backend.common.util;

import java.time.Duration;

/** Parses compact TTL strings such as {@code 15m}, {@code 30d}, {@code 24h}. */
public final class TtlParser {

    private TtlParser() {}

    public static Duration parse(String ttl) {
        if (ttl == null || ttl.isBlank()) {
            throw new IllegalArgumentException("TTL must not be empty");
        }
        String value = ttl.trim();
        char unit = value.charAt(value.length() - 1);
        long amount;
        try {
            amount = Long.parseLong(value.substring(0, value.length() - 1));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid TTL: " + ttl);
        }
        return switch (unit) {
            case 's' -> Duration.ofSeconds(amount);
            case 'm' -> Duration.ofMinutes(amount);
            case 'h' -> Duration.ofHours(amount);
            case 'd' -> Duration.ofDays(amount);
            default -> throw new IllegalArgumentException("Invalid TTL unit in: " + ttl);
        };
    }

    public static long toMillis(String ttl) {
        return parse(ttl).toMillis();
    }
}
