export interface AppErrorOptions {
  errorCode?: string;
  details?: unknown;
  isOperational?: boolean;
}

// Central error type. `isOperational` distinguishes expected, client-caused
// failures (4xx) from genuine bugs/infra failures (5xx). Operational errors
// do not require the process to restart; the error handler decides what the
// client is allowed to see.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = options.errorCode ?? this.defaultErrorCode(statusCode);
    this.isOperational = options.isOperational ?? statusCode < 500;
    this.details = options.details;
    Error.captureStackTrace(this, this.constructor);
  }

  private defaultErrorCode(statusCode: number): string {
    switch (statusCode) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'TOO_MANY_REQUESTS';
      default:
        return 'INTERNAL_ERROR';
    }
  }

  static badRequest(message = 'Bad request', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 400, options);
  }

  static unauthorized(
    message = 'Authentication required',
    options: AppErrorOptions = {},
  ): AppError {
    return new AppError(message, 401, options);
  }

  static forbidden(
    message = 'You do not have permission to perform this action',
    options: AppErrorOptions = {},
  ): AppError {
    return new AppError(message, 403, options);
  }

  static notFound(message = 'Resource not found', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 404, options);
  }

  static conflict(message = 'Resource conflict', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 409, options);
  }

  static tooManyRequests(
    message = 'Too many requests, please try again later',
    options: AppErrorOptions = {},
  ): AppError {
    return new AppError(message, 429, options);
  }

  static internal(message = 'Internal server error', options: AppErrorOptions = {}): AppError {
    return new AppError(message, 500, { ...options, isOperational: false });
  }
}
