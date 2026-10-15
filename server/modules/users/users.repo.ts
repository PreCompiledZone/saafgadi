import type { SessionUser, UserDto } from '../../../shared/types';
import type { users } from '../../db/schema';

type UserRow = typeof users.$inferSelect;

export function toSessionUser(
  u: Pick<UserRow, 'id' | 'name' | 'mobile' | 'email' | 'emailVerifiedAt' | 'role'>,
): SessionUser {
  return {
    id: u.id,
    name: u.name,
    mobile: u.mobile,
    email: u.email,
    emailVerified: !!u.email && !!u.emailVerifiedAt,
    role: u.role,
  };
}

/** Changing the email address clears its verification. */
export function emailChange(current: string | null, next: string | null | undefined) {
  return next !== undefined && (next ?? null) !== (current ?? null)
    ? { emailVerifiedAt: null }
    : {};
}

/** Never includes password_hash. */
export function toUserDto(u: UserRow): UserDto {
  return {
    ...toSessionUser(u),
    isActive: u.isActive,
    societyId: u.societyId,
    addressLine: u.addressLine,
    societyOrBuilding: u.societyOrBuilding,
    flatOrHouseNo: u.flatOrHouseNo,
    area: u.area,
    city: u.city,
    pincode: u.pincode,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
  };
}
