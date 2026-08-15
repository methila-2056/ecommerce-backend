import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/core/app.js';
import { User } from '../src/modules/user/user.model.js';

// Builds an isolated app instance per call (createApp is a factory).
export function buildApp(): Express {
  return createApp();
}

export interface RegisteredUser {
  email: string;
  password: string;
  accessToken: string;
  userId: string;
}

// Registers a fresh customer, verifies their email directly in the database
// (the raw token lives only in the dev email log), and logs them in.
export async function registerAndLogin(app: Express, email: string): Promise<RegisteredUser> {
  const password = 'Test-12345!';
  const registerRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Test Customer',
    email,
    password,
  });
  if (registerRes.status !== 201) {
    throw new Error(`register failed: ${registerRes.status} ${JSON.stringify(registerRes.body)}`);
  }
  const userId = registerRes.body.data.id;

  await User.updateOne({ _id: userId }, { $set: { emailVerifiedAt: new Date() } });

  const loginRes = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (loginRes.status !== 200) {
    throw new Error(`login failed: ${loginRes.status} ${JSON.stringify(loginRes.body)}`);
  }

  return { email, password, accessToken: loginRes.body.data.accessToken as string, userId };
}

// Thin authenticated HTTP client: the API reads the access token from the
// Authorization header only (never from cookies).
export function authed(app: Express, accessToken: string) {
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);
  return {
    get: (path: string) => auth(request(app).get(path)),
    post: (path: string, body?: unknown) => auth(request(app).post(path)).send(body ?? {}),
    patch: (path: string, body?: unknown) => auth(request(app).patch(path)).send(body ?? {}),
    delete: (path: string) => auth(request(app).delete(path)),
  };
}

// Grants roles directly in the DB — the authenticate middleware reloads roles
// from the database on every request, so the existing access token takes the
// new permissions immediately without re-login.
export async function grantRoles(email: string, roles: string[]): Promise<void> {
  await User.updateOne({ email }, { $set: { roles } });
}
