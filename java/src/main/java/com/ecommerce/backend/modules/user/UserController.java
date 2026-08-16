package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.api.ApiResponse;
import com.ecommerce.backend.common.api.PageMeta;
import com.ecommerce.backend.common.api.Pagination;
import com.ecommerce.backend.common.error.ApiException;
import com.ecommerce.backend.modules.user.UserDtos.AddressInput;
import com.ecommerce.backend.modules.user.UserDtos.DeactivateAccountRequest;
import com.ecommerce.backend.modules.user.UserDtos.UpdateAddressRequest;
import com.ecommerce.backend.modules.user.UserDtos.UpdateProfileRequest;
import com.ecommerce.backend.modules.user.UserDtos.UpdateUserRolesRequest;
import com.ecommerce.backend.modules.user.UserDtos.UpdateUserStatusRequest;
import com.ecommerce.backend.modules.user.UserService.AddressPublic;
import com.ecommerce.backend.modules.user.UserService.ProfilePublic;
import com.ecommerce.backend.modules.user.UserService.UserListResult;
import com.ecommerce.backend.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** User endpoints (mirrors {@code user.routes.ts} + {@code user.controller.ts}). */
@RestController
@RequestMapping("/api/v1/users")
@Validated
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    // -------------------------------------------------------------- Self-service

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<ProfilePublic>> getProfile(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        return ResponseEntity.ok(
                ApiResponse.success(userService.getProfile(current.userId()), "Profile retrieved successfully"));
    }

    @PatchMapping("/me")
    public ResponseEntity<ApiResponse<ProfilePublic>> updateProfile(
            @Valid @RequestBody UpdateProfileRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        ProfilePublic profile = userService.updateProfile(current.userId(), body);
        return ResponseEntity.ok(ApiResponse.success(profile, "Profile updated successfully"));
    }

    @GetMapping("/me/addresses")
    public ResponseEntity<ApiResponse<List<AddressPublic>>> listAddresses(
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        ProfilePublic profile = userService.getProfile(current.userId());
        return ResponseEntity.ok(
                ApiResponse.success(profile.addresses(), "Addresses retrieved successfully"));
    }

    @PostMapping("/me/addresses")
    public ResponseEntity<ApiResponse<AddressPublic>> addAddress(
            @Valid @RequestBody AddressInput body, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        AddressPublic address = userService.addAddress(current.userId(), body);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(address, "Address added successfully"));
    }

    @PatchMapping("/me/addresses/{id}")
    public ResponseEntity<ApiResponse<AddressPublic>> updateAddress(
            @PathVariable String id,
            @Valid @RequestBody UpdateAddressRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        AddressPublic address = userService.updateAddress(current.userId(), id, body);
        return ResponseEntity.ok(ApiResponse.success(address, "Address updated successfully"));
    }

    @DeleteMapping("/me/addresses/{id}")
    public ResponseEntity<ApiResponse<Void>> removeAddress(
            @PathVariable String id, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        userService.removeAddress(current.userId(), id);
        return ResponseEntity.ok(ApiResponse.success(null, "Address removed successfully"));
    }

    @PostMapping("/me/addresses/{id}/default")
    public ResponseEntity<ApiResponse<AddressPublic>> setDefaultAddress(
            @PathVariable String id, @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        AddressPublic address = userService.setDefaultAddress(current.userId(), id);
        return ResponseEntity.ok(ApiResponse.success(address, "Default address updated"));
    }

    @PostMapping("/me/deactivate")
    public ResponseEntity<ApiResponse<Void>> deactivateAccount(
            @Valid @RequestBody DeactivateAccountRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        userService.deactivateAccount(current.userId(), body.password());
        return ResponseEntity.ok(ApiResponse.success(null, "Account deactivated"));
    }

    // -------------------------------------------------------------- Admin

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<UserPublic>>> adminListUsers(
            @RequestParam(required = false) String page,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String emailVerified,
            @RequestParam(required = false) String sort) {
        int p = Pagination.parsePage(page);
        int l = Pagination.parseLimit(limit);
        UserListResult result = userService.listUsers(p, l, search, status, role, emailVerified, sort);
        PageMeta meta = PageMeta.of(p, l, result.total());
        Map<String, Object> metaMap = new LinkedHashMap<>();
        metaMap.put("page", meta.page());
        metaMap.put("limit", meta.limit());
        metaMap.put("total", meta.total());
        metaMap.put("totalPages", meta.totalPages());
        metaMap.put("hasNextPage", meta.hasNextPage());
        metaMap.put("hasPreviousPage", meta.hasPreviousPage());
        return ResponseEntity.ok(
                ApiResponse.success(result.users(), "Users retrieved successfully", metaMap));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ProfilePublic>> adminGetUser(@PathVariable String id) {
        ProfilePublic profile = userService.getUser(id);
        return ResponseEntity.ok(ApiResponse.success(profile, "User retrieved successfully"));
    }

    @PatchMapping("/{id}/status")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<UserPublic>> adminUpdateUserStatus(
            @PathVariable String id,
            @Valid @RequestBody UpdateUserStatusRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        UserPublic updated = userService.updateUserStatus(id, body.status(), current.userId());
        return ResponseEntity.ok(ApiResponse.success(updated, "User status updated successfully"));
    }

    @PatchMapping("/{id}/roles")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<UserPublic>> adminUpdateUserRoles(
            @PathVariable String id,
            @Valid @RequestBody UpdateUserRolesRequest body,
            @AuthenticationPrincipal CurrentUser user) {
        CurrentUser current = requireUser(user);
        UserPublic updated = userService.updateUserRoles(id, body.roles(), current.userId());
        return ResponseEntity.ok(ApiResponse.success(updated, "User roles updated successfully"));
    }

    private CurrentUser requireUser(CurrentUser user) {
        if (user == null) {
            throw ApiException.unauthorized("Authentication required", "UNAUTHENTICATED");
        }
        return user;
    }
}
