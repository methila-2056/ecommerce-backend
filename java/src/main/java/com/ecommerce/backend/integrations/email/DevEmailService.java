package com.ecommerce.backend.integrations.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Development email provider: logs the message instead of sending it. */
@Service
public class DevEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(DevEmailService.class);

    @Override
    public void send(EmailMessage message) {
        log.info("DEV EMAIL -> to={}, subject={}\n{}", message.to(), message.subject(), message.text());
    }
}
