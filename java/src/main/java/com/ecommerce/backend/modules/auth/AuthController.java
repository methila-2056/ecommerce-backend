package com.ecommerce.backend.modules.auth;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.auth.AuthDtos.ChangePasswordRequest;
import com.ecommerce.backend.modules.auth.AuthDtos.ForgotPasswordRequest;
import com.ecommerce.backend.modules.auth.AuthDtos.LoginData;
import com.ecommerce.backend.modules.auth.AuthDtos.LoginRequest;
import com.ecommerce.backend.modules.auth.AuthDtos.RefreshData;
import com.ecommerce.backend.modules.auth.AuthDtos.RegisterRequest;
import com.ecommerce.backend.modules.auth.AuthDtos.ResendVerificationRequest;
import com.ecommerce.backend.modules.auth.AuthDtos.ResetPasswordRequest;
import com.ecommerce.backend.modules.auth.SessionService.SessionMeta;
import com.ecommerce.backend.modules.auth.SessionService.SessionPublic;
import com.ecommerce.backend.modules.user.UserPublic;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Auth endpoints (mirrors {@code auth.routes.ts} + {@code auth.controller.ts}). */
@RestController
@RequestMapping("/api/v1/auth")
@Validated
public class AuthController {

    private final AuthService authService;
    private final AuthCookieService cookieService;

    public AuthController(AuthService authService, AuthCookieService cookieService) {
        this.authService = authService;
        this.cookieService = cookieService;
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserPublic>> register(@Valid @RequestBody RegisterRequest req) {
        UserPublic user = authService.register(req.name(), req.email(), req.password());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(user, "Registration successful. Verify your email to activate your account."));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<ApiResponse<UserPublic>> verifyEmail(
            @RequestParam @NotBlank(message = "Token is required") String token) {
        return ResponseEntity.ok(ApiResponse.success(authService.verifyEmail(token), "Email verified successfully"));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<ApiResponse<Void>> resendVerification(@Valid @RequestBody ResendVerificationRequest req) {
        authService.resendVerificationEmail(req.email());
        return ResponseEntity.ok(ApiResponse.success(
                null, "If the account exists, a verification email has been sent."));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginData>> login(
            @Valid @RequestBody LoginRequest req, HttpServletRequest request, HttpServletResponse response) {
        LoginData data = authService.login(req.email(), req.password(), sessionMeta(request));
        cookieService.setRefreshCookie(response, data.refreshToken());
        return ResponseEntity.ok(ApiResponse.success(data, "Login successful"));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<RefreshData>> refresh(
            @RequestBody(required = false) AuthDtos.RefreshRequest body,
            HttpServletRequest request,
            HttpServletResponse response) {
        String token = cookieService.getRefreshToken(request, body == null ? null : body.refreshToken());
        if (token == null) {
            throw ApiException.unauthorized("Refresh token is required", "MISSING_REFRESH_TOKEN");
        }
        RefreshData data = authService.refresh(token, sessionMeta(request));
        cookieService.setRefreshCookie(response, data.refreshToken());
        return ResponseEntity.ok(ApiResponse.success(data, "Token refreshed successfully"));
    }

    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @AuthenticationPrincipal CurrentUser user, HttpServletResponse response) {
        CurrentUser current = requireUser(user);
        authService.logout(current.userId(), current.sessionId());
        cookieService.clearRefreshCookie(response);
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out successfully"));
    }

    @PostMapping("/logout-all")
    public ResponseEntity<ApiResponse<Void>> logoutAll(
            @AuthenticationPrincipal CurrentUser user, HttpServletResponse response) {
        CurrentUser current = requireUser(user);
        authService.logoutAll(current.userId());
        cookieService.clearRefreshCookie(response);
        return ResponseEntity.ok(ApiResponse.success(null, "Logged out of all devices"));
    }

    @PostMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal CurrentUser user, @Valid @RequestBody ChangePasswordRequest req) {
        CurrentUser current = requireUser(user);
        authService.changePassword(
                current.userId(), req.currentPassword(), req.newPassword(), current.sessionId());
        return ResponseEntity.ok(ApiResponse.success(null, "Password changed successfully"));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest req) {
        authService.forgotPassword(req.email());
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(null, "If the account exists, a password reset email has been sent."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        authService.resetPassword(req.token(), req.newPassword());
        return ResponseEntity.ok(ApiResponse.success(null, "Password has been reset. Please sign in."));
    }

    @GetMapping("/sessions")
    public ResponseEntity<ApiResponse<List<SessionPublic>>> listSessions(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        List<SessionPublic> sessions = authService.listSessions(current.userId(), current.sessionId());
        return ResponseEntity.ok(ApiResponse.success(sessions, "Sessions retrieved successfully"));
    }

    @DeleteMapping("/sessions/{id}")
    public ResponseEntity<ApiResponse<Void>> revokeSession(
            @AuthenticationPrincipal CurrentUser user, @PathVariable String id) {
        CurrentUser current = requireUser(user);
        authService.revokeSession(current.userId(), id);
        return ResponseEntity.ok(ApiResponse.success(null, "Session revoked successfully"));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserPublic>> getMe(@AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        return ResponseEntity.ok(ApiResponse.success(authService.getMe(current.userId()), "Profile retrieved successfully"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }

    private SessionMeta sessionMeta(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        String ip = forwarded != null && !forwarded.isBlank()
                ? forwarded.split(",")[0].trim()
                : request.getRemoteAddr();
        String userAgent = request.getHeader("User-Agent");
        if (userAgent != null && userAgent.length() > 500) {
            userAgent = userAgent.substring(0, 500);
        }
        return new SessionMeta(ip, userAgent);
    }
}
