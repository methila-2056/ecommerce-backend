import { logger } from '../../config/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

// Boundary of the notification system. Callers depend on this interface only,
// so the provider can be swapped without touching business logic. The console
// provider keeps Phase 2 runnable without external credentials; a real SMTP/
// provider implementation replaces it in the notifications phase.
export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject }, `[email] ${message.text}`);
  }
}

export const emailProvider: EmailProvider = new ConsoleEmailProvider();
