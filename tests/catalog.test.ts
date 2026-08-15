import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, grantRoles, registerAndLogin } from './helpers.js';
interface CreatedProduct {
  productId: string;
  variantId: string;
}

async function createProduct(
  app: request.SuperTest<import('node:http').Server>,
  accessToken: string,
  overrides: { name?: string; status?: string; priceCents?: number; quantity?: number } = {},
): Promise<CreatedProduct> {
  const res = await request(app as never)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: overrides.name ?? 'Test Widget',
      summary: 'A widget for testing',
      status: overrides.status ?? 'published',
      variants: [
        {
          sku: `SKU-${Math.random().toString(36).slice(2, 10)}`,
          attributes: { color: 'red' },
          priceCents: overrides.priceCents ?? 2000,
          taxRate: 0,
          quantity: overrides.quantity ?? 10,
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

async function setupAdmin(
  app: request.SuperTest<import('node:http').Server>,
  email: string,
): Promise<{ email: string; accessToken: string }> {
  const admin = await registerAndLogin(app, email);
  await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
  return admin;
}

describe('Catalog (storefront visibility, search, and admin management)', () => {
  it('hides drafts and inactive products from the storefront but not from admins', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'admin-visibility@test.dev');

    await createProduct(app, admin.accessToken, { name: 'Visible Widget' });
    const draft = await createProduct(app, admin.accessToken, {
      name: 'Hidden Widget',
      status: 'draft',
    });

    // Storefront list only shows the published product.
    const list = await request(app).get('/api/v1/products');
    expect(list.status).toBe(200);
    const names = list.body.data.map((p: { name: string }) => p.name);
    expect(names).toContain('Visible Widget');
    expect(names).not.toContain('Hidden Widget');

    // Storefront detail 404s for the draft.
    const hidden = await request(app).get(`/api/v1/products/${draft.productId}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.code).toBe('NOT_FOUND');

    // Admin view sees it and includes stock.
    const adminView = await request(app as never)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminView.status).toBe(200);
    expect(adminView.body.data.map((p: { id: string }) => p.id)).toContain(draft.productId);

    const adminDetail = await request(app as never)
      .get(`/api/v1/admin/products/${draft.productId}`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.data.variants[0].stock.available).toBe(10);
  });

  it('searches, filters, and sorts the published catalog', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'admin-search@test.dev');

    await createProduct(app, admin.accessToken, { name: 'Wireless Mouse', priceCents: 2500 });
    await createProduct(app, admin.accessToken, { name: 'Mechanical Keyboard', priceCents: 7500 });

    const search = await request(app).get('/api/v1/products').query({ keyword: 'mouse' });
    expect(search.status).toBe(200);
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].name).toBe('Wireless Mouse');

    const sorted = await request(app).get('/api/v1/products').query({ sort: 'price_asc' });
    expect(sorted.body.data[0].minPriceCents).toBe(2500);

    const keywordPlusLimit = await request(app)
      .get('/api/v1/products')
      .query({ keyword: 'keyboard', limit: 5 });
    expect(keywordPlusLimit.body.data[0].minPriceCents).toBe(7500);
  });

  it('exposes product details by id and slug without leaking stock', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'admin-detail@test.dev');
    const { productId } = await createProduct(app, admin.accessToken, { name: 'Detail Widget' });

    const byId = await request(app).get(`/api/v1/products/${productId}`);
    expect(byId.status).toBe(200);
    expect(byId.body.data.variants[0].inStock).toBe(true);
    expect(byId.body.data.variants[0].stock).toBeUndefined();

    const bySlug = await request(app).get(`/api/v1/products/slug/${byId.body.data.slug}`);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.data.id).toBe(productId);
  });

  it('enforces role checks on catalog management endpoints', async () => {
    const app = buildApp();
    const customer = await registerAndLogin(app, 'cust-catalog-rbac@test.dev');

    const create = await request(app as never)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send({
        name: 'Sneak',
        variants: [{ sku: 'SNEAK-1', priceCents: 100, quantity: 1 }],
      });
    expect(create.status).toBe(403);
    expect(create.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    const list = await request(app as never)
      .get('/api/v1/admin/products')
      .set('Authorization', `Bearer ${customer.accessToken}`);
    expect(list.status).toBe(403);
  });

  it('manages categories and brands that the storefront lists', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'admin-taxonomy@test.dev');

    const categoryRes = await request(app as never)
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Accessories' });
    expect(categoryRes.status).toBe(201);

    const brandRes = await request(app as never)
      .post('/api/v1/admin/brands')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ name: 'Acme' });
    expect(brandRes.status).toBe(201);

    const categories = await request(app).get('/api/v1/categories');
    expect(categories.body.data.map((c: { name: string }) => c.name)).toContain('Accessories');

    const brands = await request(app).get('/api/v1/brands');
    expect(brands.body.data.map((b: { name: string }) => b.name)).toContain('Acme');
  });
});
