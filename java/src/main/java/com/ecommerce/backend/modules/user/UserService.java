package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.Role;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.audit.AuditService;
import com.ecommerce.backend.modules.auth.SessionService;
import com.ecommerce.backend.security.PasswordHashing;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.bson.types.ObjectId;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

/** Profile, address and admin user management (mirrors {@code user.service.ts}). */
@Service
public class UserService {

    private static final int MAX_ADDRESSES = 10;

    private final UserRepository userRepository;
    private final SessionService sessionService;
    private final PasswordHashing passwordHashing;
    private final MongoTemplate mongo;
    private final AuditService auditService;

    public UserService(
            UserRepository userRepository,
            SessionService sessionService,
            PasswordHashing passwordHashing,
            MongoTemplate mongo,
            AuditService auditService) {
        this.userRepository = userRepository;
        this.sessionService = sessionService;
        this.passwordHashing = passwordHashing;
        this.mongo = mongo;
        this.auditService = auditService;
    }

    // -------------------------------------------------------------- Public shapes

    public record AddressPublic(
            String id,
            String label,
            String recipient,
            String phone,
            String line1,
            String line2,
            String city,
            String state,
            String postalCode,
            String country,
            boolean isDefault) {}

    public record PreferencesPublic(
            String language, String currency, boolean newsletter, boolean marketingEmails) {}

    public record ProfilePublic(
            String id,
            String name,
            String email,
            String phone,
            List<Role> roles,
            String status,
            boolean emailVerified,
            String createdAt,
            List<AddressPublic> addresses,
            PreferencesPublic preferences,
            String deactivatedAt) {}

    // ----------------------------------------------------------------- Profile

    public ProfilePublic getProfile(String userId) {
        User user = requireUser(userId);
        return toProfilePublic(user);
    }

    public ProfilePublic updateProfile(String userId, UserDtos.UpdateProfileRequest input) {
        User user = requireUser(userId);
        if (input.name() != null) {
            user.name = input.name().trim();
        }
        if (input.phone() != null) {
            user.phone = input.phone();
        }
        if (input.preferences() != null) {
            UserDtos.PreferencesInput p = input.preferences();
            if (p.language() != null) {
                user.preferences.language = p.language().trim();
            }
            if (p.currency() != null) {
                user.preferences.currency = p.currency().trim().toUpperCase(java.util.Locale.ROOT);
            }
            if (p.newsletter() != null) {
                user.preferences.newsletter = p.newsletter();
            }
            if (p.marketingEmails() != null) {
                user.preferences.marketingEmails = p.marketingEmails();
            }
        }
        user.updatedAt = Instant.now();
        userRepository.save(user);
        auditService.log("user.profile_updated", userId, null, Map.of());
        return toProfilePublic(user);
    }

    // -------------------------------------------------------------- Addresses

    public AddressPublic addAddress(String userId, UserDtos.AddressInput input) {
        User user = requireUser(userId);
        if (user.addresses.size() >= MAX_ADDRESSES) {
            throw ApiException.badRequest(
                    "Maximum of " + MAX_ADDRESSES + " addresses allowed", "ADDRESS_LIMIT_REACHED");
        }

        boolean isFirst = user.addresses.isEmpty();
        Address address = new Address();
        address.id = new ObjectId().toHexString();
        address.label = input.label().trim();
        address.recipient = input.recipient().trim();
        address.phone = input.phone().trim();
        address.line1 = input.line1().trim();
        address.line2 = input.line2() == null ? null : input.line2().trim();
        address.city = input.city().trim();
        address.state = input.state().trim();
        address.postalCode = input.postalCode().trim();
        address.country = input.country().trim().toUpperCase(java.util.Locale.ROOT);
        address.isDefault = input.isDefault() == null ? isFirst : input.isDefault();
        user.addresses.add(address);

        if (address.isDefault) {
            for (Address other : user.addresses) {
                if (other != address && other.isDefault) {
                    other.isDefault = false;
                }
            }
        }
        user.updatedAt = Instant.now();
        userRepository.save(user);
        ensureDefaultAddress(user);
        userRepository.save(user);
        auditService.log("user.address_added", userId, null, Map.of("addressId", address.id));
        return toAddressPublic(address);
    }

    public AddressPublic updateAddress(String userId, String addressId, UserDtos.UpdateAddressRequest input) {
        User user = requireUser(userId);
        Address address = findAddress(user, addressId);

        if (input.label() != null) address.label = input.label().trim();
        if (input.recipient() != null) address.recipient = input.recipient().trim();
        if (input.phone() != null) address.phone = input.phone().trim();
        if (input.line1() != null) address.line1 = input.line1().trim();
        if (input.line2() != null) address.line2 = input.line2().trim();
        if (input.city() != null) address.city = input.city().trim();
        if (input.state() != null) address.state = input.state().trim();
        if (input.postalCode() != null) address.postalCode = input.postalCode().trim();
        if (input.country() != null) {
            address.country = input.country().trim().toUpperCase(java.util.Locale.ROOT);
        }
        if (Boolean.TRUE.equals(input.isDefault())) {
            for (Address other : user.addresses) {
                other.isDefault = false;
            }
            address.isDefault = true;
        }
        user.updatedAt = Instant.now();
        userRepository.save(user);
        auditService.log("user.address_updated", userId, null, Map.of("addressId", addressId));
        return toAddressPublic(address);
    }

    public void removeAddress(String userId, String addressId) {
        User user = requireUser(userId);
        Address removed = findAddress(user, addressId);
        boolean wasDefault = removed.isDefault;
        user.addresses.removeIf(a -> addressId.equals(a.id));
        if (wasDefault) {
            ensureDefaultAddress(user);
        }
        user.updatedAt = Instant.now();
        userRepository.save(user);
        auditService.log("user.address_removed", userId, null, Map.of("addressId", addressId));
    }

    public AddressPublic setDefaultAddress(String userId, String addressId) {
        User user = requireUser(userId);
        Address address = findAddress(user, addressId);
        for (Address other : user.addresses) {
            other.isDefault = false;
        }
        address.isDefault = true;
        user.updatedAt = Instant.now();
        userRepository.save(user);
        auditService.log("user.address_set_default", userId, null, Map.of("addressId", addressId));
        return toAddressPublic(address);
    }

    // ------------------------------------------------------------- Deactivate

    public void deactivateAccount(String userId, String password) {
        User user = requireUser(userId);
        if (!passwordHashing.matches(password, user.passwordHash)) {
            throw ApiException.badRequest("Password is incorrect", "INVALID_PASSWORD");
        }
        user.status = User.STATUS_DEACTIVATED;
        user.deactivatedAt = Instant.now();
        user.updatedAt = user.deactivatedAt;
        userRepository.save(user);
        sessionService.revokeAllSessions(userId, "account_deactivated", null);
        auditService.log("user.account_deactivated", userId, null, Map.of());
    }

    // ------------------------------------------------------------- Admin lists

    public record UserListResult(List<UserPublic> users, long total) {}

    public UserListResult listUsers(
            int page,
            int limit,
            String search,
            String status,
            String role,
            String emailVerified,
            String sort) {
        Query query = new Query();
        if (search != null && !search.isBlank()) {
            Pattern regex = Pattern.compile(Pattern.quote(search.trim()), Pattern.CASE_INSENSITIVE);
            query.addCriteria(new Criteria().orOperator(
                    Criteria.where("name").regex(regex),
                    Criteria.where("email").regex(regex)));
        }
        if (status != null && !status.isBlank()) {
            query.addCriteria(Criteria.where("status").is(status));
        }
        if (role != null && !role.isBlank()) {
            query.addCriteria(Criteria.where("roles").is(role));
        }
        if (emailVerified != null && !emailVerified.isBlank()) {
            if ("true".equals(emailVerified)) {
                query.addCriteria(Criteria.where("emailVerifiedAt").ne(null));
            } else if ("false".equals(emailVerified)) {
                query.addCriteria(Criteria.where("emailVerifiedAt").is(null));
            }
        }

        long total = mongo.count(query, User.class);
        Sort dbSort = switch (sort == null ? "newest" : sort) {
            case "oldest" -> Sort.by(Sort.Direction.ASC, "createdAt");
            case "name" -> Sort.by(Sort.Direction.ASC, "name");
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };
        query.with(dbSort)
                .skip((long) (page - 1) * limit)
                .limit(limit);
        List<User> users = mongo.find(query, User.class);
        return new UserListResult(users.stream().map(UserPublic::from).toList(), total);
    }

    public ProfilePublic getUser(String userId) {
        return toProfilePublic(requireUser(userId));
    }

    public UserPublic updateUserStatus(String userId, String status, String actorId) {
        User user = requireUser(userId);
        if (userId.equals(actorId) && !User.STATUS_ACTIVE.equals(status)) {
            throw ApiException.badRequest(
                    "You cannot change the status of your own account", "SELF_ACTION_FORBIDDEN");
        }
        user.status = status;
        if (User.STATUS_DEACTIVATED.equals(status)) {
            user.deactivatedAt = Instant.now();
        } else if (User.STATUS_ACTIVE.equals(status)) {
            user.deactivatedAt = null;
        }
        user.updatedAt = Instant.now();
        userRepository.save(user);

        if (!User.STATUS_ACTIVE.equals(status)) {
            sessionService.revokeAllSessions(
                    userId,
                    User.STATUS_DEACTIVATED.equals(status) ? "account_deactivated" : "suspended",
                    null);
        }
        auditService.log("user.status_changed", actorId, null, Map.of(
                "userId", userId, "status", status));
        return UserPublic.from(user);
    }

    public UserPublic updateUserRoles(String userId, List<Role> roles, String actorId) {
        User user = requireUser(userId);
        if (userId.equals(actorId)) {
            throw ApiException.badRequest(
                    "You cannot change the roles of your own account", "SELF_ACTION_FORBIDDEN");
        }
        if (roles == null || roles.isEmpty()) {
            throw ApiException.badRequest("At least one role is required", "VALIDATION_ERROR");
        }
        if (new HashSet<>(roles).size() != roles.size()) {
            throw ApiException.badRequest("Roles must be unique", "VALIDATION_ERROR");
        }
        user.roles = new ArrayList<>(roles);
        user.updatedAt = Instant.now();
        userRepository.save(user);
        auditService.log("user.roles_changed", actorId, null, Map.of(
                "userId", userId, "roles", roles.stream().map(Enum::name).toList()));
        return UserPublic.from(user);
    }

    // -------------------------------------------------------------- Internals

    private User requireUser(String userId) {
        if (!ObjectId.isValid(userId)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiException.notFound("User not found"));
    }

    private Address findAddress(User user, String addressId) {
        if (!ObjectId.isValid(addressId)) {
            throw ApiException.badRequest("Invalid identifier format", "BAD_REQUEST");
        }
        for (Address address : user.addresses) {
            if (addressId.equals(address.id)) {
                return address;
            }
        }
        throw ApiException.notFound("Address not found");
    }

    private void ensureDefaultAddress(User user) {
        if (!user.addresses.isEmpty() && user.addresses.stream().noneMatch(a -> a.isDefault)) {
            user.addresses.get(0).isDefault = true;
        }
    }

    private AddressPublic toAddressPublic(Address a) {
        return new AddressPublic(
                a.id,
                a.label,
                a.recipient,
                a.phone,
                a.line1,
                a.line2,
                a.city,
                a.state,
                a.postalCode,
                a.country,
                a.isDefault);
    }

    private ProfilePublic toProfilePublic(User user) {
        List<AddressPublic> addresses = user.addresses == null
                ? List.of()
                : user.addresses.stream().map(this::toAddressPublic).toList();
        UserPreferences p = user.preferences == null ? new UserPreferences() : user.preferences;
        return new ProfilePublic(
                user.id,
                user.name,
                user.email,
                user.phone,
                user.roles,
                user.status,
                user.isEmailVerified(),
                user.createdAt == null ? null : user.createdAt.toString(),
                addresses,
                new PreferencesPublic(
                        p.language, p.currency, p.newsletter, p.marketingEmails),
                user.deactivatedAt == null ? null : user.deactivatedAt.toString());
    }
}
