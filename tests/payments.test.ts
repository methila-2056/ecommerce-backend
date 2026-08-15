import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { authed, buildApp, grantRoles, registerAndLogin } from './helpers.js';
import { processWebhook } from '../src/modules/payment/payment.service.js';
import { getPaymentProvider } from '../src/modules/payment/payment.provider.js';
import { Payment } from '../src/modules/payment/payment.model.js';

const SHIPPING = {
  fullName: 'Jane Doe',
  phone: '+15550001234',
  line1: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
  country: 'US',
};

async function placePaidOrder(app: ReturnType<typeof buildApp>) {
  const admin = await registerAndLogin(app, 'admin-pay@test.dev');
  await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
  const productRes = await request(app as never)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${admin.accessToken}`)
    .send({
      name: 'Pay Widget',
      status: 'published',
      variants: [{ sku: 'PAY-001', priceCents: 1000, quantity: 5 }],
    });
  const productId = productRes.body.data.id as string;
  const variantId = productRes.body.data.variants[0].id as string;

  const customer = await registerAndLogin(app, 'cust-pay@test.dev');
  const api = authed(app, customer.accessToken);
  await api.post('/api/v1/cart', { productId, variantId, quantity: 1 });
  const order = (await api.post('/api/v1/orders', { shippingAddress: SHIPPING })).body.data;
  await api.post('/api/v1/payments/checkout', { orderId: order.id });

  const payment = await Payment.findOne({ orderId: order.id }).sort({ createdAt: -1 });
  return {
    orderId: order.id,
    providerReference: payment!.providerReference,
    amountCents: payment!.amountCents,
  };
}

describe('Payment webhooks', () => {
  it('rejects an invalid HMAC signature', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/v1/payments/webhook/mock')
      .set('x-webhook-signature', 'deadbeef')
      .send({
        id: 'wh_1',
        type: 'payment.succeeded',
        object: { id: 'mock_pay_x', amount_cents: 1000 },
      });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_WEBHOOK_SIGNATURE');
  });

  it('acknowledges but ignores webhooks for unknown payments (stops retry loops)', async () => {
    const app = buildApp();
    const provider = getPaymentProvider('mock');
    const { body, signature } = provider.buildSignedWebhook({
      type: 'payment.succeeded',
      providerReference: 'mock_pay_does_not_exist',
      amountCents: 5000,
    });
    const res = await request(app)
      .post('/api/v1/payments/webhook/mock')
      .set('x-webhook-signature', signature)
      .send(JSON.parse(body.toString('utf8')));
    expect(res.status).toBe(200);
    expect(res.body.handled).toBe(false);
  });

  it('is idempotent: a replayed webhook has no second side effect', async () => {
    const app = buildApp();
    const { orderId } = await placePaidOrder(app);

    const provider = getPaymentProvider('mock');
    const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 });
    const { body, signature } = provider.buildSignedWebhook({
      type: 'payment.succeeded',
      providerReference: payment!.providerReference,
      amountCents: payment!.amountCents,
    });

    const first = await processWebhook('mock', body, signature);
    expect(first.handled).toBe(true);

    const replay = await processWebhook('mock', body, signature);
    expect(replay.duplicate).toBe(true);
    expect(replay.handled).toBe(false);
  });

  it('fails the order when the gateway reports a failed payment', async () => {
    const app = buildApp();
    const customer = await registerAndLogin(app, 'cust-payfail@test.dev');
    const admin = await registerAndLogin(app, 'admin-payfail@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const productRes = await request(app as never)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({
        name: 'Fail Widget',
        status: 'published',
        variants: [{ sku: 'FAIL-001', priceCents: 900, quantity: 5 }],
      });
    const productId = productRes.body.data.id as string;
    const variantId = productRes.body.data.variants[0].id as string;
    const api = authed(app, customer.accessToken);
    await api.post('/api/v1/cart', { productId, variantId, quantity: 1 });
    const order = (await api.post('/api/v1/orders', { shippingAddress: SHIPPING })).body.data;

    // Simulate an in-flight (created) payment attempt whose gateway callback
    // reports failure — no auto-approval involved on purpose.
    await Payment.create({
      idempotencyKey: `ck_test_fail_${order.id}`,
      orderId: order.id,
      userId: customer.userId,
      provider: 'mock',
      providerReference: 'mock_pay_fail_001',
      amountCents: order.totalCents,
      currency: 'USD',
      status: 'created',
    });
    const provider = getPaymentProvider('mock');
    const { body, signature } = provider.buildSignedWebhook({
      type: 'payment.failed',
      providerReference: 'mock_pay_fail_001',
      amountCents: order.totalCents,
    });
    const res = await processWebhook('mock', body, signature);
    expect(res.handled).toBe(true);

    const orderAfter = await api.get(`/api/v1/orders/${order.id}`);
    expect(orderAfter.body.data.paymentStatus).toBe('failed');
    expect(orderAfter.body.data.status).toBe('pending');
  });
});
