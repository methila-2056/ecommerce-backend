package com.ecommerce.backend.integrations.email;

/** Email delivery abstraction. Dev-only until a real provider is wired in. */
public interface EmailService {

    void send(EmailMessage message);

    record EmailMessage(String to, String subject, String text) {}
}
