package com.ecommerce.backend.modules.auth;

import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.common.util.SecureTokens;
import com.ecommerce.backend.common.util.TtlParser;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.integrations.email.EmailService;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserPublic;
import com.ecommerce.backend.modules.user.UserRepository;
import com.ecommerce.backend.security.JwtService;
import com.ecommerce.backend.security.PasswordHashing;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.springframework.data.mongodb.core.FindAndModifyOptions;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

/** Auth flows (mirrors {@code auth.service.ts}). */
@Service
public class AuthService {

    private final UserRepository userRepository;
    private final MongoTemplate mongo;
    private final PasswordHashing passwordHashing;
    private final JwtService jwtService;
    private final SessionService sessionService;
    private final EmailService emailService;
    private final AuditService auditService;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final AppConfig config;

    /** Compared against when the email is unknown so login timing does not
     * reveal whether an account exists (user-enumeration defence). */
    private final String dummyPasswordHash;

    public AuthService(
            UserRepository userRepository,
            MongoTemplate mongo,
            PasswordHashing passwordHashing,
            JwtService jwtService,
            SessionService sessionService,
            EmailService emailService,
            AuditService auditService,
            PasswordResetTokenRepository passwordResetTokenRepository,
            AppConfig config) {
        this.userRepository = userRepository;
        this.mongo = mongo;
        this.passwordHashing = passwordHashing;
        this.jwtService = jwtService;
        this.sessionService = sessionService;
        this.emailService = emailService;
        this.auditService = auditService;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.config = config;
        this.dummyPasswordHash = passwordHashing.hash("dummy-password-timing-equalizer");
    }

    public UserPublic register(String name, String email, String password) {
        String normalizedEmail = email.toLowerCase();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw ApiException.conflict("An account with this email already exists", "EMAIL_TAKEN");
        }
        User user = new User();
        user.name = name;
        user.email = normalizedEmail;
        user.passwordHash = passwordHashing.hash(password);
        User saved = userRepository.save(user);

        // The unique index on email remains the final guard against a concurrent
        // double-registration race; a duplicate here surfaces as a 409 via the
        // global handler.
        sendVerificationEmail(saved);
        auditService.log("auth.register", saved.id, null, null);
        return UserPublic.from(saved);
    }

    public UserPublic verifyEmail(String token) {
        User updated = mongo.findAndModify(
                query(where("emailVerifiedAt").is(null)
                        .and("emailVerificationTokenHash").is(SecureTokens.sha256(token))
                        .and("emailVerificationExpiresAt").gt(Instant.now())),
                new Update().set("emailVerifiedAt", Instant.now()).unset("emailVerificationTokenHash"),
                FindAndModifyOptions.options().returnNew(true),
                User.class);
        if (updated == null) {
            throw ApiException.badRequest("Verification token is invalid or has expired", "INVALID_TOKEN");
        }
        auditService.log("auth.email_verified", updated.id, null, null);
        return UserPublic.from(updated);
    }

    public void resendVerificationEmail(String email) {
        User user = userRepository.findByEmail(email.toLowerCase()).orElse(null);
        // Unknown email or already-verified account both return successfully so
        // the endpoint cannot be used to enumerate which addresses exist.
        if (user == null || user.isEmailVerified()) {
            return;
        }
        sendVerificationEmail(user);
    }

    public AuthDtos.LoginData login(String email, String password, SessionService.SessionMeta meta) {
        User user = userRepository.findByEmail(email.toLowerCase()).orElse(null);
        Instant now = Instant.now();

        if (user != null && user.lockUntil != null && user.lockUntil.isAfter(now)) {
            long retryAfterSeconds = Duration.between(now, user.lockUntil).getSeconds() + 1;
            auditService.log("auth.login_blocked", user.id, meta.ip(), null);
            throw ApiException.tooManyRequests(
                    "Account temporarily locked due to too many failed attempts",
                    "ACCOUNT_LOCKED",
                    Map.of("retryAfterSeconds", retryAfterSeconds));
        }

        boolean passwordValid = user != null
                ? passwordHashing.matches(password, user.passwordHash)
                : passwordHashing.matches(password, dummyPasswordHash);

        if (user == null || !passwordValid) {
            if (user != null) {
                handleFailedLogin(user, meta);
            }
            throw ApiException.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
        }

        if (!User.STATUS_ACTIVE.equals(user.status)) {
            throw ApiException.forbidden("This account has been disabled", "ACCOUNT_DISABLED");
        }

        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        user.lastLoginAt = now;
        userRepository.save(user);

        SessionService.CreatedSession created = sessionService.createSession(user.id, meta, null);
        String accessToken = jwtService.signAccessToken(user.id, user.roles, created.sessionId());
        auditService.log("auth.login.success", user.id, meta.ip(), null);
        return new AuthDtos.LoginData(
                UserPublic.from(user), accessToken, created.refreshToken(), jwtService.getAccessTtlMillis());
    }

    private void handleFailedLogin(User user, SessionService.SessionMeta meta) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= config.loginMaxAttempts()) {
            user.lockUntil = Instant.now().plus(Duration.ofMinutes(config.accountLockMinutes()));
            user.failedLoginAttempts = 0;
            auditService.log("auth.account_locked", user.id, meta.ip(), null);
        }
        userRepository.save(user);
    }

    public AuthDtos.RefreshData refresh(String presentedToken, SessionService.SessionMeta meta) {
        SessionService.RotateResult result = sessionService.rotateSession(presentedToken, meta);
        if ("reuse".equals(result.status())) {
            auditService.log("auth.refresh_reuse", null, meta.ip(), null);
            throw ApiException.unauthorized("Session revoked; please sign in again", "SESSION_REVOKED");
        }
        if ("invalid".equals(result.status())) {
            throw ApiException.unauthorized("Invalid or expired refresh token", "INVALID_TOKEN");
        }
        String accessToken = jwtService.signAccessToken(result.userId(), result.roles(), result.sessionId());
        auditService.log("auth.refresh", result.userId(), null, null);
        return new AuthDtos.RefreshData(
                accessToken, result.refreshToken(), jwtService.getAccessTtlMillis(), result.sessionId());
    }

    public void logout(String userId, String sessionId) {
        boolean revoked = sessionService.revokeSessionById(sessionId, userId, "logout");
        auditService.log("auth.logout", userId, null,
                revoked ? null : Map.of("outcome", "session_not_found"));
    }

    public void logoutAll(String userId) {
        sessionService.revokeAllSessions(userId, "logout", null);
        auditService.log("auth.logout", userId, null, null);
    }

    public void changePassword(String userId, String currentPassword, String newPassword, String currentSessionId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        if (!passwordHashing.matches(currentPassword, user.passwordHash)) {
            throw ApiException.badRequest("Current password is incorrect", "INVALID_CURRENT_PASSWORD");
        }
        if (currentPassword.equals(newPassword)) {
            throw ApiException.badRequest("New password must be different from the current password");
        }
        user.passwordHash = passwordHashing.hash(newPassword);
        user.passwordChangedAt = Instant.now();
        userRepository.save(user);

        // Changing the password signs every other device out; the current
        // session stays so the user is not logged out mid-action.
        sessionService.revokeAllSessions(userId, "password_changed", currentSessionId);
        auditService.log("auth.password_changed", userId, null, null);
    }

    public void forgotPassword(String email) {
        User user = userRepository.findByEmail(email.toLowerCase()).orElse(null);
        // Unknown email still returns the same success response (no enumeration).
        if (user == null) {
            auditService.log("auth.password_reset_requested", null, null, Map.of("userId", "unknown"));
            return;
        }
        String rawToken = SecureTokens.generateSecureToken(24);
        // Only one active reset per account at a time prevents token spam.
        passwordResetTokenRepository.deleteByUserIdAndUsedAtIsNull(user.id);
        PasswordResetToken record = new PasswordResetToken();
        record.tokenHash = SecureTokens.sha256(rawToken);
        record.userId = user.id;
        record.expiresAt = Instant.now().plus(TtlParser.parse(config.passwordResetTokenTtl()));
        passwordResetTokenRepository.save(record);

        emailService.send(new EmailService.EmailMessage(
                user.email,
                "Reset your password",
                "Reset your password by opening: " + config.frontendUrl() + "/reset-password?token=" + rawToken));
        auditService.log("auth.password_reset_requested", user.id, null, null);
    }

    public void resetPassword(String token, String newPassword) {
        PasswordResetToken record = passwordResetTokenRepository
                .findByTokenHashAndUsedAtIsNull(SecureTokens.sha256(token))
                .orElse(null);
        if (record == null || record.expiresAt == null || !record.expiresAt.isAfter(Instant.now())) {
            throw ApiException.badRequest("Reset token is invalid or has expired", "INVALID_TOKEN");
        }
        User user = userRepository.findById(record.userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));

        user.passwordHash = passwordHashing.hash(newPassword);
        user.passwordChangedAt = Instant.now();
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
        // Receiving a reset email proves mailbox ownership, so verification completes.
        if (!user.isEmailVerified()) {
            user.emailVerifiedAt = Instant.now();
        }
        userRepository.save(user);

        record.usedAt = Instant.now();
        passwordResetTokenRepository.save(record);

        sessionService.revokeAllSessions(user.id, "password_changed", null);
        auditService.log("auth.password_reset", user.id, null, null);
    }

    public java.util.List<SessionService.SessionPublic> listSessions(String userId, String currentSessionId) {
        return sessionService.listSessionsForUser(userId, currentSessionId);
    }

    public void revokeSession(String userId, String sessionId) {
        // Ownership is enforced in the query (sessionId AND userId) so one user
        // can never revoke another user's session (IDOR protection).
        boolean revoked = sessionService.revokeSessionById(sessionId, userId, "revoked");
        if (!revoked) {
            throw ApiException.notFound("Session not found");
        }
        auditService.log("auth.logout", userId, null, Map.of("sessionId", sessionId));
    }

    public UserPublic getMe(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
        return UserPublic.from(user);
    }

    private void sendVerificationEmail(User user) {
        String rawToken = SecureTokens.generateSecureToken(24);
        mongo.updateFirst(
                query(where("_id").is(user.id)),
                new Update()
                        .set("emailVerificationTokenHash", SecureTokens.sha256(rawToken))
                        .set("emailVerificationExpiresAt",
                                Instant.now().plus(TtlParser.parse(config.emailVerificationTokenTtl()))),
                User.class);
        emailService.send(new EmailService.EmailMessage(
                user.email,
                "Verify your email address",
                "Verify your email address by opening: " + config.frontendUrl()
                        + "/verify-email?token=" + rawToken));
        auditService.log("auth.email_verification_sent", user.id, null, null);
    }
}
