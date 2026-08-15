import type { Response } from 'express';

// Consistent success envelope used by every controller:
// { success, message, data, meta }. `meta` carries pagination/filter info.
export function sendSuccess<T>(
  res: Response,
  data: T,
  message = 'Success',
  meta?: object,
  status = 200,
): void {
  res.status(status).json({
    success: true,
    message,
    data,
    ...(meta ? { meta } : {}),
  });
}
