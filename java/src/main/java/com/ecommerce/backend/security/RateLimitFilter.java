package com.ecommerce.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * In-memory fixed-window rate limiting keyed on the client IP and request
 * path (mirrors the per-endpoint {@code express-rate-limit} configs). The
 * account-lockout in the auth service is the second line of defence.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    public record Limit(String path, long windowSeconds, long limit, String message, String code) {}

    private static final List<Limit> ENDPOINT_LIMITS = List.of(
            new Limit("/api/v1/auth/register", 900, 10,
                    "Too many registration attempts, please try again later", "REGISTER_RATE_LIMITED"),
            new Limit("/api/v1/auth/login", 900, 20,
                    "Too many login attempts, please try again later", "LOGIN_RATE_LIMITED"),
            new Limit("/api/v1/auth/forgot-password", 900, 5,
                    "Too many password reset requests, please try again later", "PASSWORD_RESET_RATE_LIMITED"),
            new Limit("/api/v1/auth/reset-password", 3600, 10,
                    "Too many password reset attempts, please try again later", "PASSWORD_RESET_RATE_LIMITED"),
            new Limit("/api/v1/auth/resend-verification", 900, 5,
                    "Too many verification requests, please try again later", "VERIFICATION_RATE_LIMITED"),
            new Limit("/api/v1/auth/verify-email", 900, 20,
                    "Too many verification attempts, please try again later", "VERIFICATION_RATE_LIMITED"));

    private static final Limit DEFAULT_LIMIT =
            new Limit("/**", 60, 120, "Too many requests, please try again later", "RATE_LIMITED");

    private final ConcurrentHashMap<String, Window> store = new ConcurrentHashMap<>();

    private static final class Window {
        final AtomicLong startMillis = new AtomicLong();
        final AtomicLong count = new AtomicLong();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        Limit limit = ENDPOINT_LIMITS.stream()
                .filter(l -> l.path().equals(path))
                .findFirst()
                .orElse(DEFAULT_LIMIT);

        long now = System.currentTimeMillis();
        String key = clientIp(request) + "|" + path;
        Window window = store.computeIfAbsent(key, k -> {
            Window w = new Window();
            w.startMillis.set(now);
            return w;
        });

        synchronized (window) {
            if (now - window.startMillis.get() >= limit.windowSeconds() * 1000L) {
                window.startMillis.set(now);
                window.count.set(0);
            }
            long count = window.count.incrementAndGet();
            if (count > limit.limit()) {
                long retryAfter = limit.windowSeconds() - (now - window.startMillis.get()) / 1000L;
                response.setHeader("Retry-After", Long.toString(Math.max(retryAfter, 1)));
                ErrorResponseWriter.writeError(response, 429, limit.message(), limit.code());
                return;
            }
        }

        chain.doFilter(request, response);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
