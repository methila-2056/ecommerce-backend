package com.ecommerce.backend.security;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.common.Role;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Reads a {@code Bearer} access token, verifies it and populates the security
 * context. Invalid or expired tokens produce the same 401 envelope as the
 * TypeScript middleware (code differs so logs stay useful).
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            try {
                JwtService.AccessPayload payload = jwtService.verifyAccessToken(token);
                CurrentUser user = new CurrentUser(payload.userId(), payload.sessionId(), payload.roles());
                List<SimpleGrantedAuthority> authorities = payload.roles().stream()
                        .map(r -> new SimpleGrantedAuthority("ROLE_" + r.name()))
                        .map(a -> (SimpleGrantedAuthority) a)
                        .toList();
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(user, null, authorities);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            } catch (ApiException e) {
                ErrorResponseWriter.writeError(response, e);
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
