import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';
import { AppError } from './AppError.js';

interface MongoServerErrorLike {
  code?: number;
}

// body-parser raises HttpError with a `type` like 'entity.parse.failed'
// (malformed JSON), 'entity.too.large' (payload too big), 'entity.verify.failed'.
interface HttpErrorLike {
  type?: string;
  status?: number;
  statusCode?: number;
}

const isBodyParserError = (err: unknown): err is HttpErrorLike =>
  typeof err === 'object' &&
  err !== null &&
  (err as HttpErrorLike).type?.startsWith('entity.') === true &&
  ((err as HttpErrorLike).status ?? (err as HttpErrorLike).statusCode) !== undefined;

// Single place where every error becomes a consistent JSON response.
// Security rule: in production the client never sees stack traces or
// internal messages for unexpected errors.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestLogger = req.log ?? logger;

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  const isAppError = err instanceof AppError;

  if (!isAppError && err instanceof Error && err.name === 'ValidationError') {
    // Mongoose document validation failed.
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: [{ path: 'document', message: err.message }],
    });
    return;
  }

  if (!isAppError && err instanceof Error && err.name === 'CastError') {
    res.status(400).json({ success: false, message: 'Invalid identifier format' });
    return;
  }

  if (
    !isAppError &&
    typeof err === 'object' &&
    err !== null &&
    (err as MongoServerErrorLike).code === 11000
  ) {
    // Unique index violation.
    res.status(409).json({ success: false, message: 'Resource already exists' });
    return;
  }

  if (isBodyParserError(err)) {
    const status = err.status ?? err.statusCode ?? 400;
    const message = status === 413 ? 'Request body too large' : 'Invalid JSON body';
    requestLogger.warn({ err, requestId: req.id }, 'Malformed request body');
    res.status(status).json({ success: false, message });
    return;
  }

  const statusCode = isAppError ? err.statusCode : 500;
  const isOperational = isAppError ? err.isOperational : false;

  if (!isOperational) {
    requestLogger.error({ err, requestId: req.id }, 'Unhandled error');
  } else if (statusCode >= 500) {
    requestLogger.error({ err, requestId: req.id }, 'Operational server error');
  } else {
    requestLogger.warn({ err, requestId: req.id }, 'Request failed');
  }

  const message = isAppError ? err.message : 'Internal server error';
  const errorCode = isAppError ? err.errorCode : 'INTERNAL_ERROR';
  const exposeDetails =
    isAppError && (statusCode < 500 || env.NODE_ENV !== 'production') && err.details !== undefined;

  res.status(statusCode).json({
    success: false,
    message,
    code: errorCode,
    ...(exposeDetails ? { details: err.details } : {}),
  });
};
