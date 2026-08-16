package com.ecommerce.backend.security;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Password hashing with bcrypt cost 12 (mirrors {@code password.service.ts}).
 * bcrypt is memory-hard and deliberately slow — exactly what you want for
 * passwords: it makes offline brute-force of a leaked hash database expensive.
 */
@Component
public class PasswordHashing {

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(12);

    public String hash(String rawPassword) {
        return encoder.encode(rawPassword);
    }

    public boolean matches(String rawPassword, String encodedHash) {
        return encoder.matches(rawPassword, encodedHash);
    }
}
