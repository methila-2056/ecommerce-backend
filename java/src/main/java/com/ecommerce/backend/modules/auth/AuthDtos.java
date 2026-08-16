package com.ecommerce.backend.modules.auth;

import com.ecommerce.backend.modules.user.UserPublic;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request/response payloads for the auth module (mirrors {@code auth.validators.ts}). */
public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank(message = "Name is required")
            @Size(min = 2, max = 100, message = "Name must be at least 2 characters")
            String name,
            @NotBlank(message = "A valid email address is required")
            @Email(message = "A valid email address is required")
            String email,
            @NotBlank(message = "Password is required")
            @Size(min = 8, max = 128, message = "Password must be at least 8 characters")
            @Pattern(regexp = ".*[a-z].*", message = "Password must contain a lowercase letter")
            @Pattern(regexp = ".*[A-Z].*", message = "Password must contain an uppercase letter")
            @Pattern(regexp = ".*[0-9].*", message = "Password must contain a number")
            String password) {}

    public record LoginRequest(
            @NotBlank(message = "A valid email address is required")
            @Email(message = "A valid email address is required")
            String email,
            @NotBlank(message = "Password is required")
            String password) {}

    public record VerifyEmailRequest(@NotBlank(message = "Token is required") String token) {}

    public record ResendVerificationRequest(
            @NotBlank(message = "A valid email address is required")
            @Email(message = "A valid email address is required")
            String email) {}

    public record ForgotPasswordRequest(
            @NotBlank(message = "A valid email address is required")
            @Email(message = "A valid email address is required")
            String email) {}

    public record ResetPasswordRequest(
            @NotBlank(message = "Token is required") String token,
            @NotBlank(message = "Password is required")
            @Size(min = 8, max = 128, message = "Password must be at least 8 characters")
            @Pattern(regexp = ".*[a-z].*", message = "Password must contain a lowercase letter")
            @Pattern(regexp = ".*[A-Z].*", message = "Password must contain an uppercase letter")
            @Pattern(regexp = ".*[0-9].*", message = "Password must contain a number")
            String newPassword) {}

    public record ChangePasswordRequest(
            @NotBlank(message = "Current password is required") String currentPassword,
            @NotBlank(message = "Password is required")
            @Size(min = 8, max = 128, message = "Password must be at least 8 characters")
            @Pattern(regexp = ".*[a-z].*", message = "Password must contain a lowercase letter")
            @Pattern(regexp = ".*[A-Z].*", message = "Password must contain an uppercase letter")
            @Pattern(regexp = ".*[0-9].*", message = "Password must contain a number")
            String newPassword) {}

    /** Login response: user + tokens at the top level of {@code data}. */
    public record LoginData(
            UserPublic user,
            String accessToken,
            String refreshToken,
            long expiresInMs) {}

    public record RefreshData(
            String accessToken,
            String refreshToken,
            long expiresInMs,
            String sessionId) {}

    /** Optional body payload for {@code POST /auth/refresh}; the cookie is authoritative. */
    public record RefreshRequest(String refreshToken) {}
}
