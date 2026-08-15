import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/errors/AppError.js';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  PaymentStatusResult,
  RefundResult,
  WebhookEvent,
} from '../payment.provider.js';

// Mock gateway used in development and tests. It speaks the same contract as a
// real gateway but settles payments instantly (no network, no PCI scope) and
// lets us exercise every code path:
//   - createPayment returns `succeeded` immediately when PAYMENT_MOCK_AUTO_APPROVE
//     is true; otherwise it returns `created` and the caller waits for a
//     webhook (which the dev-only /payments/mock/notify endpoint can emit).
//   - Webhook payloads are HMAC-SHA256 signed exactly like a real gateway
//     would be, so the webhook route and signature verification are real code.

const eventsForWebhookType: Record<string, string> = {
  'payment.succeeded': 'pay_succeeded',
  'payment.failed': 'pay_failed',
  'refund.succeeded': 'refund_succeeded',
};

// Real gateways use their own wire event names; the mock speaks Stripe-like
// names on the wire and maps them back to the canonical events the application
// understands.
const webhookTypeToEvent: Record<string, WebhookEvent['type']> = {
  pay_succeeded: 'payment.succeeded',
  pay_failed: 'payment.failed',
  refund_succeeded: 'refund.succeeded',
};

function sign(payload: Buffer): string {
  return createHmac('sha256', env.PAYMENT_WEBHOOK_SECRET).update(payload).digest('hex');
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerReference = `mock_pay_${randomUUID().replaceAll('-', '')}`;
    const autoApprove = env.PAYMENT_MOCK_AUTO_APPROVE === 'true';

    if (autoApprove) {
      // Emit the same event the webhook path would have, so the order is
      // confirmed through the exact same code path (payment.service's event
      // handler) rather than a special-case. The result reports `succeeded` so
      // createCheckout knows it can confirm the order right away.
      const body = {
        id: `wh_${randomUUID().replaceAll('-', '')}`,
        type: 'payment.succeeded',
        object: {
          id: providerReference,
          amount_cents: input.amountCents,
          currency: input.currency,
          order_id: input.orderId,
          idempotency_key: input.idempotencyKey,
        },
      };
      this._queuedEvents.push({ body, providerReference, amountCents: input.amountCents });
      return {
        providerReference,
        status: 'succeeded',
        checkoutUrl: null,
        raw: { auto_approved: true },
      };
    }

    return {
      providerReference,
      status: 'created',
      checkoutUrl: null,
      raw: { auto_approved: false },
    };
  }

  async getPaymentStatus(providerReference: string): Promise<PaymentStatusResult> {
    const queued = this._queuedEvents.find((e) => e.providerReference === providerReference);
    if (queued && queued.body.type === 'payment.succeeded') {
      return { status: 'succeeded', refundedCents: 0, raw: queued.body };
    }
    return { status: 'created', refundedCents: 0, raw: { providerReference } };
  }

  async verifyWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent> {
    const expected = sign(rawBody);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const providedBuffer = Buffer.from(signature, 'hex');
    if (
      providedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw AppError.unauthorized('Invalid webhook signature', {
        errorCode: 'INVALID_WEBHOOK_SIGNATURE',
      });
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw AppError.badRequest('Malformed webhook payload', { errorCode: 'MALFORMED_WEBHOOK' });
    }

    const type = payload.type as string;
    const webhookId = payload.id as string;
    const object = payload.object as { id?: string; amount_cents?: number; reason?: string };
    if (!type || !webhookId || !object?.id) {
      throw AppError.badRequest('Malformed webhook payload', { errorCode: 'MALFORMED_WEBHOOK' });
    }

    return {
      type: webhookTypeToEvent[type] ?? (type as WebhookEvent['type']),
      webhookId,
      providerReference: object.id,
      amountCents: object.amount_cents ?? 0,
      reason: object.reason,
      refundReference: payload.refund_reference as string | undefined,
      raw: payload,
    };
  }

  async refundPayment(
    providerReference: string,
    input: { amountCents?: number; reason?: string },
  ): Promise<RefundResult> {
    const refundReference = `mock_ref_${randomUUID().replaceAll('-', '')}`;
    const body = {
      id: `wh_${randomUUID().replaceAll('-', '')}`,
      type: 'refund.succeeded',
      object: {
        id: providerReference,
        amount_cents: input.amountCents ?? 0,
        reason: input.reason,
      },
      refund_reference: refundReference,
    };
    this._queuedEvents.push({ body, providerReference, amountCents: input.amountCents ?? 0 });
    return { refundReference, status: 'refunded' };
  }

  // Dev-only: builds a correctly-signed webhook payload for the given event so
  // developers can simulate a gateway callback against the real webhook route.
  buildSignedWebhook(input: {
    type: string;
    providerReference: string;
    amountCents: number;
    reason?: string;
  }): { body: Buffer; signature: string } {
    const body = {
      id: `wh_${randomUUID().replaceAll('-', '')}`,
      type: eventsForWebhookType[input.type] ?? input.type,
      object: {
        id: input.providerReference,
        amount_cents: input.amountCents,
        reason: input.reason,
      },
    };
    const raw = Buffer.from(JSON.stringify(body), 'utf8');
    return { body: raw, signature: sign(raw) };
  }

  private _queuedEvents: Array<{
    body: {
      type: string;
      object: { id: string; amount_cents?: number; order_id?: string; idempotency_key?: string };
    };
    providerReference: string;
    amountCents: number;
  }> = [];
}
