package com.ecommerce.backend.security;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.config.AppConfig;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * Short-lived access tokens (HS256). Claims carry only what the API needs:
 * userId (sub), roles and the sessionId (sid) that links the access token to a
 * refresh session so revoking a session also invalidates its tokens.
 * Mirror of {@code modules/auth/token.service.ts}.
 */
@Service
public class JwtService {

    private final SecretKey accessKey;
    private final long accessTtlMillis;

    public JwtService(AppConfig config) {
        this.accessKey = Keys.hmacShaKeyFor(config.jwtAccessSecret().getBytes(StandardCharsets.UTF_8));
        this.accessTtlMillis = com.ecommerce.backend.common.util.TtlParser.toMillis(config.accessTokenTtl());
    }

    public String signAccessToken(String userId, List<Role> roles, String sessionId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(accessTtlMillis)))
                .claim("roles", roles.stream().map(Enum::name).toList())
                .claim("sid", sessionId)
                .claim("type", "access")
                .signWith(accessKey)
                .compact();
    }

    public record AccessPayload(String userId, String sessionId, List<Role> roles) {}

    public AccessPayload verifyAccessToken(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(accessKey).build().parseSignedClaims(token).getPayload();
            String type = claims.get("type", String.class);
            String sub = claims.getSubject();
            String sid = claims.get("sid", String.class);
            @SuppressWarnings("unchecked")
            List<String> roleNames = claims.get("roles", List.class);
            if (!"access".equals(type) || sub == null || sid == null || roleNames == null
                    || roleNames.stream().anyMatch(r -> !Role.isValid(r))) {
                throw new JwtException("malformed token payload");
            }
            return new AccessPayload(sub, sid, roleNames.stream().map(Role::valueOf).toList());
        } catch (ExpiredJwtException e) {
            throw ApiException.unauthorized("Access token has expired", "TOKEN_EXPIRED");
        } catch (JwtException | IllegalArgumentException e) {
            throw ApiException.unauthorized("Invalid access token", "INVALID_TOKEN");
        }
    }

    public long getAccessTtlMillis() {
        return accessTtlMillis;
    }
}
