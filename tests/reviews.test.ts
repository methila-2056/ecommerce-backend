import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { authed, buildApp, grantRoles, registerAndLogin } from './helpers.js';

interface CreatedProduct {
  productId: string;
}

async function createPublishedProduct(
  app: request.SuperTest<import('node:http').Server>,
  accessToken: string,
): Promise<CreatedProduct> {
  const res = await request(app as never)
    .post('/api/v1/admin/products')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: `Reviewable Widget ${Math.random().toString(36).slice(2, 8)}`,
      summary: 'A widget that can be reviewed',
      status: 'published',
      variants: [
        {
          sku: `SKU-${Math.random().toString(36).slice(2, 10)}`,
          attributes: { color: 'blue' },
          priceCents: 4500,
          taxRate: 0,
          quantity: 25,
          lowStockThreshold: 3,
        },
      ],
    });
  expect(res.status).toBe(201);
  return { productId: res.body.data.id as string };
}

async function setupAdmin(
  app: request.SuperTest<import('node:http').Server>,
  email: string,
): Promise<{ email: string; accessToken: string }> {
  const admin = await registerAndLogin(app, email);
  await grantRoles(admin.email, ['CUSTOMER', 'ADMIN']);
  return admin;
}

describe('Reviews (submission, moderation, and ownership)', () => {
  it('accepts a review, keeps unverified ones pending and hidden from the storefront', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'review-admin-pending@test.dev');
    const customer = await registerAndLogin(app, 'review-cust-pending@test.dev');
    const { productId } = await createPublishedProduct(app, admin.accessToken);

    const created = await authed(app, customer.accessToken).post(
      `/api/v1/products/${productId}/reviews`,
      {
        rating: 5,
        title: 'Great widget',
        body: 'Works exactly as advertised.',
      },
    );
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('pending');
    expect(created.body.data.isVerifiedPurchase).toBe(false);

    // One review per customer per product.
    const duplicate = await authed(app, customer.accessToken).post(
      `/api/v1/products/${productId}/reviews`,
      {
        rating: 1,
        body: 'Trying to review twice.',
      },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('REVIEW_EXISTS');

    // Pending submissions are not part of the public list yet.
    const list = await request(app).get(`/api/v1/products/${productId}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(0);
  });

  it('moderates the queue: approve publishes, reject requires a reason', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'review-admin-moderate@test.dev');
    const author = await registerAndLogin(app, 'review-cust-approve@test.dev');
    const rejector = await registerAndLogin(app, 'review-cust-reject@test.dev');
    const { productId } = await createPublishedProduct(app, admin.accessToken);

    const approved = await authed(app, author.accessToken).post(
      `/api/v1/products/${productId}/reviews`,
      { rating: 4, body: 'Solid purchase.' },
    );
    const rejected = await authed(app, rejector.accessToken).post(
      `/api/v1/products/${productId}/reviews`,
      { rating: 2, body: 'Meh.' },
    );

    const queue = await request(app as never)
      .get('/api/v1/admin/reviews')
      .query({ status: 'pending' })
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(queue.status).toBe(200);
    const queuedIds = queue.body.data.map((r: { id: string }) => r.id);
    expect(queuedIds).toContain(approved.body.data.id);
    expect(queuedIds).toContain(rejected.body.data.id);

    // Rejecting without a reason is a validation failure.
    const rejectNoReason = await request(app as never)
      .patch(`/api/v1/admin/reviews/${rejected.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'reject' });
    expect(rejectNoReason.status).toBe(400);
    expect(rejectNoReason.body.message).toBe('Validation failed');

    const rejectRes = await request(app as never)
      .patch(`/api/v1/admin/reviews/${rejected.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'reject', reason: 'Spam content' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');

    const approveRes = await request(app as never)
      .patch(`/api/v1/admin/reviews/${approved.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ action: 'approve' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe('approved');

    // Only the approved review is publicly visible now.
    const list = await request(app).get(`/api/v1/products/${productId}/reviews`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(approved.body.data.id);
    expect(list.body.data[0].reviewerName).toBe('Test Customer');
  });

  it('enforces ownership on edits and staff-only access to moderation', async () => {
    const app = buildApp();
    const admin = await setupAdmin(app, 'review-admin-rbac@test.dev');
    const author = await registerAndLogin(app, 'review-cust-owner@test.dev');
    const stranger = await registerAndLogin(app, 'review-cust-stranger@test.dev');
    const { productId } = await createPublishedProduct(app, admin.accessToken);

    const created = await authed(app, author.accessToken).post(
      `/api/v1/products/${productId}/reviews`,
      { rating: 3, body: 'Initial take.' },
    );
    const reviewId = created.body.data.id as string;

    // Another customer cannot modify or delete someone else's review.
    const foreignPatch = await authed(app, stranger.accessToken).patch(
      `/api/v1/reviews/${reviewId}`,
      { rating: 1 },
    );
    expect(foreignPatch.status).toBe(404);
    expect(foreignPatch.body.code).toBe('NOT_FOUND');

    const foreignDelete = await authed(app, stranger.accessToken).delete(
      `/api/v1/reviews/${reviewId}`,
    );
    expect(foreignDelete.status).toBe(404);

    // The moderation queue is staff-only.
    const forbiddenQueue = await request(app as never)
      .get('/api/v1/admin/reviews')
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(forbiddenQueue.status).toBe(403);
    expect(forbiddenQueue.body.code).toBe('INSUFFICIENT_PERMISSIONS');

    // The author updates their own review.
    const updated = await authed(app, author.accessToken).patch(`/api/v1/reviews/${reviewId}`, {
      rating: 2,
      title: 'Changed my mind',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.rating).toBe(2);
    expect(updated.body.data.title).toBe('Changed my mind');

    // ...and deletes it afterwards.
    const deleted = await authed(app, author.accessToken).delete(`/api/v1/reviews/${reviewId}`);
    expect(deleted.status).toBe(200);
    const afterDelete = await request(app as never)
      .get('/api/v1/admin/reviews')
      .query({ limit: 100 })
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(afterDelete.body.data.filter((r: { id: string }) => r.id === reviewId)).toHaveLength(0);
  });
});
