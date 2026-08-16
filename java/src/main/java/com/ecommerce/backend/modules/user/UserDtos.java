package com.ecommerce.backend.modules.user;

import com.ecommerce.backend.common.Role;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Request payloads for the user module (mirrors {@code user.validators.ts}). */
public final class UserDtos {

    private UserDtos() {}

    public record UpdateProfileRequest(
            @Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
            String name,
            @Pattern(regexp = "^[+()\\-\\s\\d]{7,20}$", message = "Invalid phone number format")
            @Size(max = 30, message = "Phone must be at most 30 characters")
            String phone,
            @Valid PreferencesInput preferences) {}

    public record PreferencesInput(
            @Size(min = 2, max = 10, message = "Language must be between 2 and 10 characters")
            String language,
            @Size(min = 3, max = 3, message = "Currency must be a 3-letter code")
            String currency,
            Boolean newsletter,
            Boolean marketingEmails) {}

    public record AddressInput(
            @NotBlank(message = "Label is required")
            @Size(min = 1, max = 50, message = "Label must be between 1 and 50 characters")
            String label,
            @NotBlank(message = "Recipient is required")
            @Size(min = 1, max = 100, message = "Recipient must be between 1 and 100 characters")
            String recipient,
            @NotBlank(message = "Phone is required")
            @Pattern(regexp = "^[+()\\-\\s\\d]+$", message = "Invalid phone number format")
            @Size(min = 7, max = 30, message = "Phone must be between 7 and 30 characters")
            String phone,
            @NotBlank(message = "Address line 1 is required")
            @Size(min = 1, max = 200, message = "Address line 1 must be between 1 and 200 characters")
            String line1,
            @Size(max = 200, message = "Address line 2 must be at most 200 characters")
            String line2,
            @NotBlank(message = "City is required")
            @Size(min = 1, max = 100, message = "City must be between 1 and 100 characters")
            String city,
            @NotBlank(message = "State is required")
            @Size(min = 1, max = 100, message = "State must be between 1 and 100 characters")
            String state,
            @NotBlank(message = "Postal code is required")
            @Size(min = 1, max = 20, message = "Postal code must be between 1 and 20 characters")
            String postalCode,
            @NotBlank(message = "Country is required")
            @Size(min = 2, max = 2, message = "Country must be a 2-letter code")
            String country,
            Boolean isDefault) {}

    public record UpdateAddressRequest(
            @Size(min = 1, max = 50, message = "Label must be between 1 and 50 characters")
            String label,
            @Size(min = 1, max = 100, message = "Recipient must be between 1 and 100 characters")
            String recipient,
            @Pattern(regexp = "^[+()\\-\\s\\d]+$", message = "Invalid phone number format")
            @Size(min = 7, max = 30, message = "Phone must be between 7 and 30 characters")
            String phone,
            @Size(min = 1, max = 200, message = "Address line 1 must be between 1 and 200 characters")
            String line1,
            @Size(max = 200, message = "Address line 2 must be at most 200 characters")
            String line2,
            @Size(min = 1, max = 100, message = "City must be between 1 and 100 characters")
            String city,
            @Size(min = 1, max = 100, message = "State must be between 1 and 100 characters")
            String state,
            @Size(min = 1, max = 20, message = "Postal code must be between 1 and 20 characters")
            String postalCode,
            @Size(min = 2, max = 2, message = "Country must be a 2-letter code")
            String country,
            Boolean isDefault) {}

    public record DeactivateAccountRequest(
            @NotBlank(message = "Password is required")
            String password) {}

    public record UpdateUserStatusRequest(
            @NotBlank(message = "Status is required")
            @Pattern(regexp = "^(active|suspended|deactivated)$", message = "Invalid user status")
            String status) {}

    public record UpdateUserRolesRequest(
            @Size(min = 1, message = "At least one role is required")
            List<Role> roles) {}
}
