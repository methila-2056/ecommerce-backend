package com.ecommerce.backend.modules.auth;

import com.ecommerce.backend.common.util.TtlParser;
import com.ecommerce.backend.config.AppConfig;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * The refresh token is returned in the body (so any client — mobile, CLI — can
 * use it) and additionally mirrored into an httpOnly cookie so browser
 * frontends get a first line of defence against XSS stealing it. Mirrors
 * {@code auth-cookie.ts}.
 */
@Component
public class AuthCookieService {

    private final AppConfig config;

    public AuthCookieService(AppConfig config) {
        this.config = config;
    }

    public void setRefreshCookie(HttpServletResponse response, String refreshToken) {
        ResponseCookie cookie = ResponseCookie.from(config.refreshCookieName(), refreshToken)
                .httpOnly(true)
                .secure(config.isProduction())
                .path("/api/v1/auth")
                .maxAge(Duration.ofMillis(TtlParser.toMillis(config.refreshTokenTtl())))
                .sameSite(config.refreshCookieSameSite().name().toLowerCase())
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(config.refreshCookieName(), "")
                .httpOnly(true)
                .secure(config.isProduction())
                .path("/api/v1/auth")
                .maxAge(Duration.ZERO)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }

    public String getRefreshToken(HttpServletRequest request, String bodyRefreshToken) {
        if (bodyRefreshToken != null && !bodyRefreshToken.isBlank()) {
            return bodyRefreshToken;
        }
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (config.refreshCookieName().equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
