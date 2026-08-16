package com.ecommerce.backend.modules.auth;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.common.util.SecureTokens;
import com.ecommerce.backend.common.util.TtlParser;
import com.ecommerce.backend.config.AppConfig;
import com.ecommerce.backend.modules.user.User;
import com.ecommerce.backend.modules.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.stereotype.Service;

import static org.springframework.data.mongodb.core.query.Criteria.where;
import static org.springframework.data.mongodb.core.query.Query.query;

/**
 * Refresh-token sessions (mirrors {@code session.service.ts}). Raw refresh
 * tokens are opaque random values, never JWTs: a token carries no identity
 * itself, it is just a key into a server-side session row — which is what makes
 * per-session revocation and reuse detection possible.
 */
@Service
public class SessionService {

    private final MongoTemplate mongo;
    private final AppConfig config;
    private final UserRepository userRepository;

    public SessionService(MongoTemplate mongo, AppConfig config, UserRepository userRepository) {
        this.mongo = mongo;
        this.config = config;
        this.userRepository = userRepository;
    }

    public record SessionMeta(String ip, String userAgent) {}

    public record CreatedSession(String sessionId, String refreshToken) {}

    public record RotateResult(
            String status, String sessionId, String refreshToken, String userId, List<Role> roles) {

        public static RotateResult ok(String sessionId, String refreshToken, String userId, List<Role> roles) {
            return new RotateResult("ok", sessionId, refreshToken, userId, roles);
        }

        public static RotateResult invalid() {
            return new RotateResult("invalid", null, null, null, null);
        }

        public static RotateResult reuse() {
            return new RotateResult("reuse", null, null, null, null);
        }
    }

    public record SessionPublic(
            String id,
            String ip,
            String userAgent,
            String createdAt,
            String lastUsedAt,
            String expiresAt,
            boolean active,
            boolean current) {}

    public CreatedSession createSession(String userId, SessionMeta meta, String existingFamilyId) {
        String familyId = existingFamilyId != null ? existingFamilyId : UUID.randomUUID().toString();
        String refreshToken = SecureTokens.generateSecureToken(32);
        RefreshSession session = new RefreshSession();
        session.userId = userId;
        session.familyId = familyId;
        session.tokenHash = SecureTokens.sha256(refreshToken);
        session.ip = meta.ip();
        session.userAgent = meta.userAgent();
        session.expiresAt = Instant.now().plus(TtlParser.parse(config.refreshTokenTtl()));
        RefreshSession saved = mongo.save(session);
        return new CreatedSession(saved.id, refreshToken);
    }

    public RotateResult rotateSession(String presentedToken, SessionMeta meta) {
        RefreshSession session =
                mongo.findOne(query(where("tokenHash").is(SecureTokens.sha256(presentedToken))), RefreshSession.class);
        Instant now = Instant.now();
        if (session == null || session.expiresAt == null || !session.expiresAt.isAfter(now)) {
            return RotateResult.invalid();
        }

        // A presented token whose session is already revoked (e.g. rotated away
        // moments ago) means it was almost certainly stolen and replayed. Burn
        // the entire family so every device in it is signed out.
        if (session.revokedAt != null) {
            revokeFamily(session.familyId, "family_revoked");
            return RotateResult.reuse();
        }

        User user = userRepository.findById(session.userId).orElse(null);
        if (user == null || !User.STATUS_ACTIVE.equals(user.status)) {
            revokeFamily(session.familyId, "family_revoked");
            return RotateResult.invalid();
        }

        mongo.updateFirst(
                query(where("_id").is(session.id)),
                new Update().set("revokedAt", now).set("revokedReason", "rotated").set("lastUsedAt", now),
                RefreshSession.class);

        CreatedSession created = createSession(user.id, meta, session.familyId);
        return RotateResult.ok(created.sessionId(), created.refreshToken(), user.id, user.roles);
    }

    public void revokeFamily(String familyId, String reason) {
        mongo.updateMulti(
                query(where("familyId").is(familyId).and("revokedAt").is(null)),
                new Update().set("revokedAt", Instant.now()).set("revokedReason", reason),
                RefreshSession.class);
    }

    public boolean revokeSessionById(String sessionId, String userId, String reason) {
        var result = mongo.updateFirst(
                query(where("_id").is(sessionId).and("userId").is(userId).and("revokedAt").is(null)),
                new Update().set("revokedAt", Instant.now()).set("revokedReason", reason),
                RefreshSession.class);
        return result.getMatchedCount() > 0;
    }

    public void revokeAllSessions(String userId, String reason, String exceptSessionId) {
        Query filter = query(where("userId").is(userId).and("revokedAt").is(null));
        if (exceptSessionId != null && !exceptSessionId.isBlank()) {
            filter.addCriteria(where("_id").ne(exceptSessionId));
        }
        mongo.updateMulti(
                filter,
                new Update().set("revokedAt", Instant.now()).set("revokedReason", reason),
                RefreshSession.class);
    }

    public List<SessionPublic> listSessionsForUser(String userId, String currentSessionId) {
        Instant now = Instant.now();
        Query query = query(where("userId").is(userId))
                .with(Sort.by(Sort.Direction.DESC, "createdAt"))
                .limit(50);
        return mongo.find(query, RefreshSession.class).stream()
                .map(s -> new SessionPublic(
                        s.id,
                        s.ip,
                        s.userAgent,
                        s.createdAt == null ? null : s.createdAt.toString(),
                        s.lastUsedAt == null ? null : s.lastUsedAt.toString(),
                        s.expiresAt == null ? null : s.expiresAt.toString(),
                        s.revokedAt == null && s.expiresAt != null && s.expiresAt.isAfter(now),
                        s.id != null && s.id.equals(currentSessionId)))
                .toList();
    }
}
