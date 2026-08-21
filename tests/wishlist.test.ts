import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { authed, buildApp, grantRoles, registerAndLogin } from './helpers.js';

async function createPublishedProduct(
  app: request.SuperTest<import('node:http').Server>,
  accessToken: string,
  name: string,
): Promise<string> {
  const res = await request(app as never)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name,
      summary: 'A wishlistable widget',
      status: 'published',
      variants: [
        {
          sku: `SKU-${Math.random().toString(36).slice(2, 10)}`,
          attributes: { color: 'green' },
          priceCents: 3200,
          taxRate: 0,
          quantity: 8,
          lowStockThreshold: 2,
        },
      ],
    });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

describe('Wishlist (add, list, remove, clear)', () => {
  it('manages the full wishlist lifecycle for a customer', async () => {
    const app = buildApp();
    const admin = await registerAndLogin(app, 'wishlist-admin@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const customer = await registerAndLogin(app, 'wishlist-cust-lifecycle@test.dev');

    const productId = await createPublishedProduct(app, admin.accessToken, 'Wishable Gadget');

    // Starts empty.
    const initial = await authed(app, customer.accessToken).get('/api/v1/wishlist');
    expect(initial.status).toBe(200);
    expect(initial.body.data).toEqual([]);

    // Adding exposes enriched storefront info.
    const added = await authed(app, customer.accessToken).post(`/api/v1/wishlist/${productId}`);
    expect(added.status).toBe(200);
    expect(added.body.data).toHaveLength(1);
    expect(added.body.data[0].productId).toBe(productId);
    expect(added.body.data[0].product.name).toBe('Wishable Gadget');
    expect(added.body.data[0].product.priceCents).toBe(3200);
    expect(added.body.data[0].product.inStock).toBe(true);

    // Duplicate adds are idempotent ($addToSet).
    const reAdded = await authed(app, customer.accessToken).post(`/api/v1/wishlist/${productId}`);
    expect(reAdded.body.data).toHaveLength(1);

    // Removal empties the list again.
    const removed = await authed(app, customer.accessToken).delete(`/api/v1/wishlist/${productId}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual([]);
  });

  it('clears every saved item in one call', async () => {
    const app = buildApp();
    const admin = await registerAndLogin(app, 'wishlist-admin-clear@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
    const customer = await registerAndLogin(app, 'wishlist-cust-clear@test.dev');

    const firstId = await createPublishedProduct(app, admin.accessToken, 'Clear Target A');
    const secondId = await createPublishedProduct(app, admin.accessToken, 'Clear Target B');

    await authed(app, customer.accessToken).post(`/api/v1/wishlist/${firstId}`);
    await authed(app, customer.accessToken).post(`/api/v1/wishlist/${secondId}`);

    const cleared = await authed(app, customer.accessToken).delete('/api/v1/wishlist');
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toEqual([]);

    const confirmed = await authed(app, customer.accessToken).get('/api/v1/wishlist');
    expect(confirmed.body.data).toEqual([]);
  });

  it('rejects unknown products and unauthenticated access', async () => {
    const app = buildApp();
    const anonymous = await request(app).get('/api/v1/wishlist');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('MISSING_TOKEN');

    const admin = await registerAndLogin(app, 'wishlist-admin-404@test.dev');
    await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);

    // Well-formed ObjectId that does not exist.
    const missing = await authed(app, admin.accessToken).post(
      '/api/v1/wishlist/aaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });
});
