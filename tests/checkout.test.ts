import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { authed, buildApp, grantRoles, registerAndLogin } from './helpers.js';

const SHIPPING = {
  fullName: 'Jane Doe',
  phone: '+15550001234',
  line1: '1 Main St',
  city: 'Springfield',
  state: 'IL',
  postalCode: '62701',
  country: 'US',
};

async function createPublishedProduct(
  app: request.SuperTest<import('node:http').Server>,
  accessToken: string,
) {
  const res = await request(app as never)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Test Widget',
      summary: 'A widget for testing',
      status: 'published',
      variants: [
        {
          sku: 'WIDGET-001',
          attributes: { color: 'red' },
          priceCents: 2000,
          taxRate: 0,
          quantity: 10,
          lowStockThreshold: 2,
        },
      ],
    });
  expect(res.status).toBe(201);
  return {
    productId: res.body.data.id as string,
    variantId: res.body.data.variants[0].id as string,
  };
}

describe('Checkout pipeline (cart â†’ order â†’ payment â†’ fulfillment)', () => {
  it('completes an order end-to-end and adjusts stock atomically', async () => {
    const app = buildApp();

    // Admin creates a product.
    const admin = await registerAndLogin(app, 'admin-checkout@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const { productId, variantId } = await createPublishedProduct(app, admin.accessToken);

    // Customer adds to cart and checks out.
    const customer = await registerAndLogin(app, 'cust-checkout@test.dev');
    const api = authed(app, customer.accessToken);

    const cartRes = await api.post('/api/v1/cart', { productId, variantId, quantity: 2 });
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.data.subtotalCents).toBe(4000);

    const orderRes = await api.post('/api/v1/orders', { shippingAddress: SHIPPING });
    expect(orderRes.status).toBe(201);
    const order = orderRes.body.data;
    expect(order.status).toBe('pending');
    expect(order.totalCents).toBe(4000); // 2 Ã— $20.00
    expect(order.items[0].sku).toBe('WIDGET-001');

    // Payment (mock auto-approve) confirms the order and deducts stock.
    const paymentRes = await api.post('/api/v1/payments/checkout', { orderId: order.id });
    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data.payment.status).toBe('succeeded');

    const orderAfter = await api.get(`/api/v1/orders/${order.id}`);
    expect(orderAfter.body.data.status).toBe('confirmed');
    expect(orderAfter.body.data.paymentStatus).toBe('paid');
    expect(orderAfter.body.data.stockDeducted).toBe(true);

    // Stock moved 10 â†’ 8 available, nothing left reserved.
    const product = await request(app as never)
      .get(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    const stock = product.body.data.variants[0].stock;
    expect(stock.available).toBe(8);
    expect(stock.reserved).toBe(0);
    expect(stock.quantity).toBe(8);

    // Fulfillment state machine: confirmed â†’ processing â†’ packed â†’ shipped â†’ delivered.
    const adminApi = authed(app, admin.accessToken);
    for (const to of ['processing', 'packed', 'shipped', 'delivered']) {
      const transition = await adminApi.post(`/api/v1/orders/admin/${order.id}/transition`, { to });
      expect(transition.status).toBe(200);
      expect(transition.body.data.status).toBe(to);
    }

    // Verified-purchase review is auto-approved.
    const reviewRes = await api.post(`/api/v1/products/${productId}/reviews`, {
      rating: 5,
      title: 'Great',
      body: 'Works as advertised.',
    });
    expect(reviewRes.status).toBe(201);
    expect(reviewRes.body.data.status).toBe('approved');
    expect(reviewRes.body.data.isVerifiedPurchase).toBe(true);

    const ratingRes = await request(app).get(`/api/v1/products/${productId}/reviews/rating`);
    expect(ratingRes.body.data.count).toBe(1);
    expect(ratingRes.body.data.average).toBe(5);
  });

  it('rejects quantities that exceed available stock', async () => {
    const app = buildApp();
    const admin = await registerAndLogin(app, 'admin-stock@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const { productId, variantId } = await createPublishedProduct(app, admin.accessToken);

    const customer = await registerAndLogin(app, 'cust-stock@test.dev');
    const api = authed(app, customer.accessToken);

    // The cart blocks the oversized line immediately with stock feedback.
    const cartRes = await api.post('/api/v1/cart', { productId, variantId, quantity: 99 });
    expect(cartRes.status).toBe(400);
    expect(cartRes.body.code).toBe('INSUFFICIENT_STOCK');

    // An empty cart cannot be checked out.
    const orderRes = await api.post('/api/v1/orders', { shippingAddress: SHIPPING });
    expect(orderRes.status).toBe(400);
    expect(orderRes.body.code).toBe('EMPTY_CART');

    const orders = await api.get('/api/v1/orders');
    expect(orders.body.data).toHaveLength(0);
  });

  it('processes a full refund and restocks the goods', async () => {
    const app = buildApp();
    const admin = await registerAndLogin(app, 'admin-refund@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const adminApi = authed(app, admin.accessToken);
    const { productId, variantId } = await createPublishedProduct(app, admin.accessToken);

    const customer = await registerAndLogin(app, 'cust-refund@test.dev');
    const api = authed(app, customer.accessToken);
    await api.post('/api/v1/cart', { productId, variantId, quantity: 1 });
    const order = (await api.post('/api/v1/orders', { shippingAddress: SHIPPING })).body.data;
    await api.post('/api/v1/payments/checkout', { orderId: order.id });

    // Customer requests a refund after the order is confirmed.
    await api.post(`/api/v1/orders/${order.id}/cancel`, { reason: 'Changed my mind' });
    const refundReq = await api.get(`/api/v1/orders/${order.id}`);
    expect(refundReq.body.data.status).toBe('refund_requested');

    // Admin processes the refund through the payment provider.
    const refundRes = await adminApi.post(`/api/v1/payments/${order.id}/refund`, {
      reason: 'Customer cancellation',
    });
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.data.status).toBe('refunded');

    const finalOrder = await api.get(`/api/v1/orders/${order.id}`);
    expect(finalOrder.body.data.status).toBe('refunded');
    expect(finalOrder.body.data.paymentStatus).toBe('refunded');

    // Sold unit is back in sellable stock.
    const product = await request(app as never)
      .get(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(product.body.data.variants[0].stock.available).toBe(10);
  });
});
