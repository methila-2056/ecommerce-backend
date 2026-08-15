// PaymentProvider is the seam between the checkout flow and a real gateway.
// The rest of the system only ever depends on this interface, so a real
// gateway (Stripe, Braintree, ...) can be dropped in by registering an
// implementation without touching order or payment services.
//
// Contract notes:
//  - Amounts are integer cents; currency is ISO 4217 (3-letter uppercase).
//  - `verifyWebhook` MUST authenticate the payload using the shared secret and
//    fail closed (throw) on any signature/format problem. The payment service
//    relies on that to reject forged callbacks.
//  - `providerReference` is the gateway's own identifier for a payment; it is
//    unique per provider and used to match webhook events back to our Payment
//    documents.

export type PaymentStatus = 'created' | 'succeeded' | 'failed' | 'refunded' | 'partially_refunded';

export interface CreatePaymentInput {
  idempotencyKey: string;
  orderId: string;
  customer: { id: string; email: string; name: string };
  amountCents: number;
  currency: string;
}

export interface CreatePaymentResult {
  providerReference: string;
  status: PaymentStatus;
  checkoutUrl: string | null;
  raw: Record<string, unknown>;
}

export interface PaymentStatusResult {
  status: PaymentStatus;
  refundedCents: number;
  raw: Record<string, unknown>;
}

export type WebhookEventType = 'payment.succeeded' | 'payment.failed' | 'refund.succeeded';

export interface WebhookEvent {
  type: WebhookEventType;
  // Gateway event id — used to deduplicate replays.
  webhookId: string;
  providerReference: string;
  amountCents: number;
  reason?: string;
  refundReference?: string;
  raw: Record<string, unknown>;
}

export interface RefundResult {
  refundReference: string;
  status: 'refunded' | 'partially_refunded';
}

export interface PaymentProvider {
  readonly name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
  refundPayment(
    providerReference: string,
    input: { amountCents?: number; reason?: string },
  ): Promise<RefundResult>;
}

// Registry keyed by provider name. `getPaymentProvider` resolves the env-
// configured provider by default; callers may pass an explicit name (used by
// the webhook route, which receives the provider in the URL path).
const registry = new Map<string, PaymentProvider>();

export function registerPaymentProvider(provider: PaymentProvider): void {
  registry.set(provider.name, provider);
}

export function getPaymentProvider(name: string): PaymentProvider {
  const provider = registry.get(name);
  if (!provider) {
    throw new Error(`No payment provider registered under "${name}"`);
  }
  return provider;
}
