package com.ecommerce.backend.config;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Validated environment configuration. Relaxed binding maps each {@code app.*}
 * property from the UPPER_SNAKE environment variable of the same name
 * ({@code app.jwt-access-secret} <- {@code APP_JWT_ACCESS_SECRET}); the exact
 * deployment env var names are preserved in application.yml via ${...}
 * placeholders (e.g. {@code app.jwt-access-secret: ${JWT_ACCESS_SECRET:}}).
 * Startup validation mirrors the TypeScript {@code env.ts}: fail fast on a
 * misconfigured deployment instead of failing at request time.
 */
@ConfigurationProperties(prefix = "app", ignoreUnknownFields = false)
public record AppConfig(
        NodeEnv nodeEnv,
        String host,
        int port,
        String databaseUrl,
        boolean useInMemoryDb,
        String corsOrigin,
        String frontendUrl,
        String jwtAccessSecret,
        String jwtRefreshSecret,
        String accessTokenTtl,
        String refreshTokenTtl,
        int loginMaxAttempts,
        int accountLockMinutes,
        String emailVerificationTokenTtl,
        String passwordResetTokenTtl,
        String refreshCookieName,
        SameSite refreshCookieSameSite,
        long shippingFlatCents,
        long freeShippingThresholdCents,
        String paymentProvider,
        String paymentWebhookSecret,
        boolean paymentMockAutoApprove,
        boolean allowMockAutoApproveInProduction) {

    /** Constructor-level validation so a bad config fails during binding. */
    public AppConfig {
        if (nodeEnv == null) {
            nodeEnv = NodeEnv.DEVELOPMENT;
        }
        if (refreshCookieSameSite == null) {
            refreshCookieSameSite = SameSite.LAX;
        }
        if (refreshCookieName == null || refreshCookieName.isBlank()) {
            refreshCookieName = "rt";
        }
    }

    public enum NodeEnv {
        DEVELOPMENT,
        TEST,
        PRODUCTION;

        public static NodeEnv parse(String value) {
            if (value == null || value.isBlank()) {
                return DEVELOPMENT;
            }
            return switch (value.trim().toLowerCase(Locale.ROOT)) {
                case "development" -> DEVELOPMENT;
                case "test" -> TEST;
                case "production" -> PRODUCTION;
                default -> throw new IllegalArgumentException(
                        "NODE_ENV must be development, test or production (got: " + value + ")");
            };
        }
    }

    public enum SameSite {
        LAX,
        STRICT,
        NONE
    }

    /**
     * Values that ship in {@code .env.example} and this repository are public
     * knowledge, so a production deployment that forgets to rotate them is
     * trivially compromised.
     */
    private static final Set<String> PLACEHOLDER_SECRETS = Set.of(
            "change-me-to-a-random-64-char-hex-string",
            "dev-webhook-secret-change-me",
            "local-dev-access-secret-change-me",
            "local-dev-refresh-secret-change-me",
            "local-dev-webhook-secret");

    public boolean isProduction() {
        return nodeEnv == NodeEnv.PRODUCTION;
    }

    public boolean isTest() {
        return nodeEnv == NodeEnv.TEST;
    }

    public String[] corsOrigins() {
        if (corsOrigin == null || corsOrigin.isBlank()) {
            return new String[0];
        }
        return Arrays.stream(corsOrigin.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toArray(String[]::new);
    }

    public void validate() {
        if (!useInMemoryDb && (databaseUrl == null || databaseUrl.isBlank())) {
            throw new IllegalStateException(
                    "Invalid environment configuration: DATABASE_URL is required "
                            + "(or set USE_IN_MEMORY_DB=true for the demo database)");
        }

        if (!isTest()) {
            requireMinLength(jwtAccessSecret, 32, "JWT_ACCESS_SECRET");
            requireMinLength(jwtRefreshSecret, 32, "JWT_REFRESH_SECRET");
        }

        if (isProduction()) {
            boolean placeholder = PLACEHOLDER_SECRETS.contains(jwtAccessSecret)
                    || PLACEHOLDER_SECRETS.contains(jwtRefreshSecret)
                    || PLACEHOLDER_SECRETS.contains(paymentWebhookSecret);
            boolean autoApprove = paymentMockAutoApprove && !allowMockAutoApproveInProduction;
            if (placeholder || autoApprove) {
                throw new IllegalStateException(
                        "Refusing to start in production: rotate JWT_ACCESS_SECRET, "
                                + "JWT_REFRESH_SECRET and PAYMENT_WEBHOOK_SECRET (placeholder values are "
                                + "rejected), and set PAYMENT_MOCK_AUTO_APPROVE=false so payments are not "
                                + "silently auto-approved (or set "
                                + "ALLOW_MOCK_AUTO_APPROVE_IN_PRODUCTION=true to explicitly opt in for a demo).");
            }
        }
    }

    private static void requireMinLength(String value, int min, String name) {
        if (value == null || value.length() < min) {
            throw new IllegalStateException(name + " must be at least " + min + " chars");
        }
    }
}
