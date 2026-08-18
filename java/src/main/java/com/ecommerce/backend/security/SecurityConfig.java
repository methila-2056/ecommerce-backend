package com.ecommerce.backend.security;

import com.ecommerce.backend.config.AppConfig;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/** Stateless JWT security (mirrors the Express auth middleware). */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            JwtService jwtService,
            AppConfig config) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource(config)))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .anonymous(anonymous -> anonymous.disable())
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/", "/health", "/ready", "/actuator/**",
                                "/api/v1/docs/**", "/api/v1/api-docs/**", "/error")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/register").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/verify-email").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/resend-verification").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/refresh").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/forgot-password").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/reset-password").permitAll()
                        .requestMatchers("/api/v1/payments/webhook/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/products",
                                "/api/v1/products/*", "/api/v1/products/slug/**",
                                "/api/v1/products/*/reviews", "/api/v1/products/*/reviews/rating",
                                "/api/v1/categories", "/api/v1/brands")
                        .permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(authenticationEntryPoint())
                        .accessDeniedHandler(accessDeniedHandler()))
                // Anchored to AuthorizationFilter (the last filter) so these run
                // AFTER SecurityContextHolderFilter — otherwise the freshly
                // populated security context gets reset before authorization.
                .addFilterBefore(new BodySizeLimitFilter(),
                        org.springframework.security.web.access.intercept.AuthorizationFilter.class)
                .addFilterBefore(new RateLimitFilter(), BodySizeLimitFilter.class)
                .addFilterBefore(new JwtAuthenticationFilter(jwtService), RateLimitFilter.class);
        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(AppConfig config) {
        CorsConfiguration cors = new CorsConfiguration();
        if (config.isProduction()) {
            cors.setAllowedOrigins(Arrays.asList(config.corsOrigins()));
        } else {
            cors.setAllowedOriginPatterns(List.of("*"));
        }
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Content-Type", "Authorization"));
        cors.setExposedHeaders(List.of("Set-Cookie"));
        cors.setAllowCredentials(true);
        cors.setMaxAge(86400L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    private AuthenticationEntryPoint authenticationEntryPoint() {
        return (HttpServletRequest request, HttpServletResponse response,
                org.springframework.security.core.AuthenticationException authException) -> {
            try {
                ErrorResponseWriter.writeError(response, 401, "Authentication required", "UNAUTHENTICATED");
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        };
    }

    private AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            try {
                ErrorResponseWriter.writeError(response, 403,
                        "You do not have permission to perform this action", "FORBIDDEN");
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        };
    }
}
