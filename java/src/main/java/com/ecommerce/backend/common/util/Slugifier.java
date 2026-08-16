package com.ecommerce.backend.common.util;

import java.util.Locale;

/** Slugify + unique-slug helpers (mirrors the TS slugify util). */
public final class Slugifier {

    private Slugifier() {}

    public static String slugify(String input) {
        if (input == null) {
            return "";
        }
        String s = input.trim().toLowerCase(Locale.ROOT);
        s = s.replaceAll("[^a-z0-9\\s-]", "");
        s = s.replaceAll("[\\s_-]+", "-");
        s = s.replaceAll("^-+|-+$", "");
        return s;
    }
}
