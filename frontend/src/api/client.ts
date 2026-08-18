import type { Envelope } from './types';

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string) || 'https://ecommerce-backend-ten-zeta.vercel.app';

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: { path: string; message: string }[];

  constructor(
    status: number,
    message: string,
    code?: string,
    errors?: { path: string; message: string }[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (res.ok) {
          const body: Envelope<{ accessToken: string; accessTokenExpiresAt: string }> =
            await res.json();
          accessToken = body.data.accessToken;
          return true;
        }
        accessToken = null;
        return false;
      } catch {
        accessToken = null;
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function raw<T>(path: string, init: RequestInit = {}, retried = false): Promise<Envelope<T>> {
  let res: Response;
  try {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  } catch {
    throw new ApiError(0, 'Network error — please check your connection');
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // non-JSON response — body stays null
  }

  if (!res.ok) {
    const skipRetry = path.startsWith('/api/v1/auth/');
    if (res.status === 401 && !retried && !skipRetry) {
      const ok = await refreshSession();
      if (ok) return raw<T>(path, init, true);
    }
    throw new ApiError(
      res.status,
      (body as { message?: string })?.message ?? 'Request failed',
      (body as { code?: string })?.code,
      (body as { errors?: { path: string; message: string }[] })?.errors,
    );
  }
  return body as Envelope<T>;
}

export const api = {
  get: <T>(path: string): Promise<Envelope<T>> => raw<T>(path),
  post: <T>(path: string, body?: unknown): Promise<Envelope<T>> =>
    raw<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown): Promise<Envelope<T>> =>
    raw<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T>(path: string): Promise<Envelope<T>> => raw<T>(path, { method: 'DELETE' }),
};
