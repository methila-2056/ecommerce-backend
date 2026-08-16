package com.ecommerce.backend.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Defends against oversized payload attacks: any request whose declared body
 * exceeds 1 MB is rejected with a 413 envelope (mirrors
 * {@code express.json({ limit: '1mb' })}).
 */
public class BodySizeLimitFilter extends OncePerRequestFilter {

    public static final long MAX_BODY_BYTES = 1024 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long contentLength = request.getContentLengthLong();
        if (contentLength > MAX_BODY_BYTES) {
            ErrorResponseWriter.writeError(response, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
            return;
        }
        chain.doFilter(request, response);
    }
}
