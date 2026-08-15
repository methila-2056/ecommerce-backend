import type { RequestHandler } from 'express';
import type { ParsedQs } from 'qs';
import type { ZodType } from 'zod';

// Parses and validates external input before it reaches any business logic.
// On failure a ZodError is forwarded to the central error handler, which turns
// it into the standard validation-error envelope.
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Express 5 exposes req.query as a getter-only property, so it must be
    // redefined rather than assigned. The instance property shadows the
    // prototype accessor for the remainder of the request.
    Object.defineProperty(req, 'query', {
      value: result.data as unknown as ParsedQs,
      configurable: true,
      enumerable: true,
      writable: true,
    });
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.params = result.data as unknown as Record<string, string>;
    next();
  };
}
