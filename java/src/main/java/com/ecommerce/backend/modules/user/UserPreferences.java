package com.ecommerce.backend.modules.user;

/** Embedded preferences document (mirrors {@code IUserPreferences}). */
public class UserPreferences {

    public String language = "en";
    public String currency = "USD";
    public boolean newsletter;
    public boolean marketingEmails;
}
