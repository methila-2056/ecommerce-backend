package com.ecommerce.backend.modules.user;

/** Embedded address document (mirrors {@code IAddress}). */
public class Address {

    @org.springframework.data.annotation.Id
    public String id;

    public String label;
    public String recipient;
    public String phone;
    public String line1;
    public String line2;
    public String city;
    public String state;
    public String postalCode;
    public String country;
    public boolean isDefault;
}
