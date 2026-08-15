import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp, grantRoles, registerAndLogin } from './helpers.js';
import { sha256 } from '../src/shared/utils/crypto.js';
import { User } from '../src/modules/user/user.model.js';

describe('Auth flow', () => {
  it('registers, verifies email and logs in', async () => {
    const app = buildApp();
    const email = 'auth@test.dev';

    const registerRes = await request(app).post('/api/v1/auth/register').send({
      name: 'Auth User',
      email,
      password: 'Strong-pass-123',
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.email).toBe(email);
    expect(registerRes.body.data.emailVerified).toBe(false);

    const userId = registerRes.body.data.id as string;

    // Emulate the email link: seed the hashed token directly (same hashing the
    // service uses) and call the verify endpoint.
    const token = 'test-verify-token';
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          emailVerificationTokenHash: sha256(token),
          emailVerificationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );

    const verifyRes = await request(app).post(`/api/v1/auth/verify-email?token=${token}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.emailVerified).toBe(true);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'Strong-pass-123' });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeTruthy();
    expect(loginRes.body.data.user.emailVerified).toBe(true);
  });

  it('rejects duplicate registration', async () => {
    const app = buildApp();
    const payload = { name: 'Dupe', email: 'dupe@test.dev', password: 'Strong-pass-123' };
    await request(app).post('/api/v1/auth/register').send(payload);
    const second = await request(app).post('/api/v1/auth/register').send(payload);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('EMAIL_TAKEN');
  });

  it('rejects invalid credentials', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Wrong PW',
      email: 'wrongpw@test.dev',
      password: 'Strong-pass-123',
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'wrongpw@test.dev',
      password: 'nope-nope-nope',
    });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('blocks unauthenticated access to protected routes', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });

  it('forbids customers from admin-only routes (RBAC via DB roles)', async () => {
    const app = buildApp();
    const { accessToken } = await registerAndLogin(app, 'customer-rbac@test.dev');

    const res = await request(app)
      .get('/api/v1/admin/dashboard/summary')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);

    // Grant ADMIN in the DB — the same token now passes because authenticate
    // reloads roles per request.
    await grantRoles('customer-rbac@test.dev', ['CUSTOMER', 'ADMIN']);
    const allowed = await request(app)
      .get('/api/v1/admin/dashboard/summary')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.revenueCents).toBe(0);
  });

  it('rotates the refresh token and rejects reuse', async () => {
    const app = buildApp();
    const email = 'refresh@test.dev';
    const password = 'Strong-pass-123';
    await request(app).post('/api/v1/auth/register').send({ name: 'Refresher', email, password });
    const user = await User.findOne({ email });
    await User.updateOne({ _id: user?._id }, { $set: { emailVerifiedAt: new Date() } });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const refreshToken = login.body.data.refreshToken as string;

    const first = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`rt=${refreshToken}`])
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toBeTruthy();

    // Reuse of the old (rotated) token must be detected and rejected.
    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [`rt=${refreshToken}`])
      .send({});
    expect(reuse.status).toBe(401);
  });
});
