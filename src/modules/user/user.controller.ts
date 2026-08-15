import type { Request, Response } from 'express';
import { AppError } from '../../shared/errors/AppError.js';
import { sendSuccess } from '../../shared/utils/response.js';
import * as userService from './user.service.js';

function requireUser(req: Request): { userId: string; actorId: string; ip: string | null } {
  if (!req.user) throw AppError.unauthorized('Authentication required');
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string' && forwarded.length > 0
      ? (forwarded.split(',')[0]?.trim() ?? null)
      : (req.ip ?? null);
  return { userId: req.user.userId, actorId: req.user.userId, ip };
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const profile = await userService.getProfile(userId);
  sendSuccess(res, profile, 'Profile retrieved successfully');
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const profile = await userService.updateProfile(userId, req.body);
  sendSuccess(res, profile, 'Profile updated successfully');
}

export async function listAddresses(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const profile = await userService.getProfile(userId);
  sendSuccess(res, profile.addresses, 'Addresses retrieved successfully');
}

export async function addAddress(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const address = await userService.addAddress(userId, req.body);
  sendSuccess(res, address, 'Address added successfully', undefined, 201);
}

export async function updateAddress(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { id } = req.params as { id: string };
  const address = await userService.updateAddress(userId, id, req.body);
  sendSuccess(res, address, 'Address updated successfully');
}

export async function removeAddress(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { id } = req.params as { id: string };
  await userService.removeAddress(userId, id);
  sendSuccess(res, null, 'Address removed successfully');
}

export async function setDefaultAddress(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { id } = req.params as { id: string };
  const address = await userService.setDefaultAddress(userId, id);
  sendSuccess(res, address, 'Default address updated');
}

export async function deactivateAccount(req: Request, res: Response): Promise<void> {
  const { userId } = requireUser(req);
  const { password } = req.body as { password: string };
  await userService.deactivateAccount(userId, password);
  sendSuccess(res, null, 'Account deactivated');
}

// ---- Admin ----

export async function adminListUsers(req: Request, res: Response): Promise<void> {
  const result = await userService.listUsers(req.query as never);
  sendSuccess(res, result.users, 'Users retrieved successfully', result.meta);
}

export async function adminGetUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };
  const user = await userService.getUser(id);
  sendSuccess(res, user, 'User retrieved successfully');
}

export async function adminUpdateUserStatus(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const { status } = req.body as { status: string };
  const user = await userService.updateUserStatus(id, status as never, actorId);
  sendSuccess(res, user, 'User status updated successfully');
}

export async function adminUpdateUserRoles(req: Request, res: Response): Promise<void> {
  const { actorId } = requireUser(req);
  const { id } = req.params as { id: string };
  const { roles } = req.body as { roles: string[] };
  const user = await userService.updateUserRoles(id, roles as never, actorId);
  sendSuccess(res, user, 'User roles updated successfully');
}
