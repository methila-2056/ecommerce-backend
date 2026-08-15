import { AppError } from '../../shared/errors/AppError.js';
import { recordAudit } from '../../shared/utils/audit.js';
import {
  buildPaginationMeta,
  toPageOptions,
  type PaginationMeta,
} from '../../shared/utils/pagination.js';
import type { Role } from '../../types/roles.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { verifyPassword } from '../auth/password.service.js';
import {
  toUserPublic,
  User,
  type IAddress,
  type UserDocument,
  type UserPublic,
  type UserStatus,
} from './user.model.js';

const MAX_ADDRESSES = 10;

export interface AddressPublic {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface ProfilePublic extends UserPublic {
  addresses: AddressPublic[];
  preferences: {
    language: string;
    currency: string;
    newsletter: boolean;
    marketingEmails: boolean;
  };
  deactivatedAt: string | null;
}

function toAddressPublic(address: IAddress): AddressPublic {
  const id = (address as unknown as { _id: { toString(): string } })._id.toString();
  return {
    id,
    label: address.label,
    recipient: address.recipient,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: address.isDefault,
  };
}

export async function getProfile(userId: string): Promise<ProfilePublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return {
    ...toUserPublic(user),
    addresses: user.addresses.map(toAddressPublic),
    preferences: {
      language: user.preferences.language,
      currency: user.preferences.currency,
      newsletter: user.preferences.newsletter,
      marketingEmails: user.preferences.marketingEmails,
    },
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
  };
}

export async function updateProfile(
  userId: string,
  input: {
    name?: string;
    phone?: string | null;
    preferences?: Partial<ProfilePublic['preferences']>;
  },
): Promise<ProfilePublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.preferences) {
    if (input.preferences.language) user.preferences.language = input.preferences.language;
    if (input.preferences.currency) user.preferences.currency = input.preferences.currency;
    if (input.preferences.newsletter !== undefined)
      user.preferences.newsletter = input.preferences.newsletter;
    if (input.preferences.marketingEmails !== undefined)
      user.preferences.marketingEmails = input.preferences.marketingEmails;
  }

  await user.save();
  recordAudit('user.profile_updated', { userId });
  return getProfile(userId);
}

function ensureDefaultAddress(user: UserDocument): void {
  if (user.addresses.length > 0 && !user.addresses.some((a) => a.isDefault)) {
    const [first] = user.addresses;
    if (first) first.isDefault = true;
  }
}

export async function addAddress(userId: string, input: IAddress): Promise<AddressPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  if (user.addresses.length >= MAX_ADDRESSES) {
    throw AppError.badRequest(`Maximum of ${MAX_ADDRESSES} addresses allowed`, {
      errorCode: 'ADDRESS_LIMIT_REACHED',
    });
  }

  const isFirst = user.addresses.length === 0;
  user.addresses.push({ ...input, isDefault: input.isDefault ?? isFirst });
  if (input.isDefault) {
    for (const address of user.addresses) {
      if (address.isDefault && address !== user.addresses.at(-1)) address.isDefault = false;
    }
  }
  await user.save();
  ensureDefaultAddress(user);
  await user.save();
  recordAudit('user.address_added', { userId });

  const created = user.addresses.at(-1);
  if (!created) throw AppError.internal('Failed to persist address');
  return toAddressPublic(created);
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: Partial<IAddress>,
): Promise<AddressPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address not found');

  if (input.isDefault === true) {
    for (const other of user.addresses) other.isDefault = false;
  }
  address.set(input);
  await user.save();
  recordAudit('user.address_updated', { userId });
  return toAddressPublic(address);
}

export async function removeAddress(userId: string, addressId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const removed = user.addresses.id(addressId);
  if (!removed) throw AppError.notFound('Address not found');

  const wasDefault = removed.isDefault;
  user.addresses.pull({ _id: removed._id });
  if (wasDefault) ensureDefaultAddress(user);
  await user.save();
  recordAudit('user.address_removed', { userId });
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<AddressPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  const address = user.addresses.id(addressId);
  if (!address) throw AppError.notFound('Address not found');

  for (const other of user.addresses) other.isDefault = false;
  address.isDefault = true;
  await user.save();
  recordAudit('user.address_set_default', { userId });
  return toAddressPublic(address);
}

export async function deactivateAccount(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw AppError.notFound('User not found');

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    throw AppError.badRequest('Password is incorrect', { errorCode: 'INVALID_PASSWORD' });
  }

  user.status = 'deactivated';
  user.deactivatedAt = new Date();
  await user.save();
  await revokeAllSessions(userId, 'account_deactivated');
  recordAudit('user.account_deactivated', { userId });
}

// ---- Admin user management ----

export interface UserListResult {
  users: UserPublic[];
  meta: PaginationMeta;
}

export async function listUsers(query: {
  page?: number;
  limit?: number;
  search?: string;
  status?: UserStatus;
  role?: Role;
  emailVerified?: 'true' | 'false';
  sort?: 'newest' | 'oldest' | 'name';
}): Promise<UserListResult> {
  const filter: Record<string, unknown> = {};
  if (query.search) {
    const searchRegex = new RegExp(escapeRegExp(query.search), 'i');
    filter.$or = [{ name: searchRegex }, { email: searchRegex }];
  }
  if (query.status) filter.status = query.status;
  if (query.role) filter.roles = query.role;
  if (query.emailVerified) {
    filter.emailVerifiedAt = query.emailVerified === 'true' ? { $ne: null } : null;
  }

  const options = toPageOptions(query);
  const sortMap: Record<string, Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
  };

  type UserFilter = Parameters<typeof User.find>[0];
  const filterQuery = filter as unknown as UserFilter;

  const [total, users] = await Promise.all([
    User.countDocuments(filterQuery),
    User.find(filterQuery)
      .sort(sortMap[query.sort ?? 'newest']!)
      .skip(options.skip)
      .limit(options.limit)
      .lean(),
  ]);

  return {
    users: users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      roles: user.roles,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      createdAt: user.createdAt.toISOString(),
    })),
    meta: buildPaginationMeta(total, options),
  };
}

export async function getUser(userId: string): Promise<ProfilePublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  return {
    ...toUserPublic(user),
    addresses: user.addresses.map(toAddressPublic),
    preferences: {
      language: user.preferences.language,
      currency: user.preferences.currency,
      newsletter: user.preferences.newsletter,
      marketingEmails: user.preferences.marketingEmails,
    },
    deactivatedAt: user.deactivatedAt?.toISOString() ?? null,
  };
}

export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  actorId: string,
): Promise<UserPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');

  if (userId === actorId && status !== 'active') {
    throw AppError.badRequest('You cannot change the status of your own account', {
      errorCode: 'SELF_ACTION_FORBIDDEN',
    });
  }

  user.status = status;
  if (status === 'deactivated') user.deactivatedAt = new Date();
  if (status === 'active') user.deactivatedAt = null;
  await user.save();

  // Suspending or deactivating an account must terminate every live session
  // immediately; leaving them running would let a revoked user keep acting.
  if (status !== 'active') {
    await revokeAllSessions(userId, status === 'deactivated' ? 'account_deactivated' : 'suspended');
  }
  recordAudit('user.status_changed', { userId, status, actorId });
  return toUserPublic(user);
}

export async function updateUserRoles(
  userId: string,
  roles: Role[],
  actorId: string,
): Promise<UserPublic> {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User not found');
  if (userId === actorId) {
    throw AppError.badRequest('You cannot change the roles of your own account', {
      errorCode: 'SELF_ACTION_FORBIDDEN',
    });
  }

  user.roles = roles;
  await user.save();
  recordAudit('user.roles_changed', { userId, roles, actorId });
  return toUserPublic(user);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
