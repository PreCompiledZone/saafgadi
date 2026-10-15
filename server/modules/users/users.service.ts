import { and, asc, count, desc, eq, exists, like, ne, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Role } from '../../../shared/enums';
import { normaliseRegistration } from '../../../shared/registration';
import type {
  adminCreateSchema,
  adminUserUpdateSchema,
  profileUpdateSchema,
  staffCreateSchema,
  staffUpdateSchema,
  userListQuery,
} from '../../../shared/schemas';
import type { AdminUserDetail, Paged, UserDto } from '../../../shared/types';
import { getDb } from '../../db';
import { subscriptions, users, vehicles } from '../../db/schema';
import { audit } from '../../lib/audit';
import { today } from '../../lib/clock';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { hashPassword } from '../../lib/passwords';
import { assertContactFree } from '../auth/auth.service';
import { listEnquiries } from '../enquiries/enquiries.service';
import { listPayments } from '../payments/payments.service';
import { findSubscriptions } from '../subscriptions/subscription.repo';
import { listUserVehicles } from '../vehicles/vehicles.service';
import { getSociety, societyFields } from '../societies/societies.service';
import { emailChange, toUserDto } from './users.repo';

export const MAX_ADMINS = 2;

export async function getUser(id: number, role?: Role): Promise<UserDto> {
  const [u] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  if (!u || (role && u.role !== role)) throw notFound(role === 'WASHER' ? 'Washer' : 'User');
  return toUserDto(u);
}

export async function updateProfile(id: number, input: z.output<typeof profileUpdateSchema>) {
  const db = getDb();
  const current = await getUser(id);
  await assertContactFree(db, current.mobile, input.email, id);
  await db
    .update(users)
    .set({
      ...input,
      ...(await societyFields(db, input)),
      ...emailChange(current.email, input.email),
    })
    .where(eq(users.id, id));
  return getUser(id);
}

export async function listUsers(q: z.output<typeof userListQuery>): Promise<Paged<UserDto>> {
  const db = getDb();
  const term = q.search?.trim();
  const reg = term ? normaliseRegistration(term) : '';
  const digits = term?.replace(/\D/g, '') ?? '';
  const where = and(
    q.role ? eq(users.role, q.role) : undefined,
    term
      ? or(
          like(users.name, `%${term}%`),
          digits.length >= 3 ? like(users.mobile, `%${digits}%`) : undefined,
          like(users.email, `%${term}%`),
          exists(
            db
              .select({ one: sql`1` })
              .from(vehicles)
              .where(
                and(eq(vehicles.userId, users.id), like(vehicles.registrationNumber, `%${reg}%`)),
              ),
          ),
        )
      : undefined,
  );
  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  return { items: rows.map(toUserDto), total, page: q.page, pageSize: q.pageSize };
}

export async function getUserDetail(id: number): Promise<AdminUserDetail> {
  const user = await getUser(id);
  const db = getDb();
  const [vehiclesList, subs, pays, enqs] = await Promise.all([
    listUserVehicles(id),
    findSubscriptions(db, today(), eq(subscriptions.userId, id)),
    listPayments({ page: 1, pageSize: 200, userId: id }),
    listEnquiries({ page: 1, pageSize: 200, userId: id }),
  ]);
  return {
    user,
    society: user.societyId ? await getSociety(user.societyId) : null,
    vehicles: vehiclesList,
    subscriptions: subs,
    payments: pays.items,
    enquiries: enqs.items,
  };
}

export async function createUser(
  actorId: number,
  role: Role,
  input: z.output<typeof staffCreateSchema>,
): Promise<UserDto> {
  const db = getDb();
  await assertContactFree(db, input.mobile, input.email);
  const [row] = await db
    .insert(users)
    .values({
      name: input.name,
      mobile: input.mobile,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role,
      createdByAdmin: role === 'USER',
    })
    .$returningId();
  if (role === 'ADMIN')
    await audit(db, actorId, 'ADMIN_CREATED', 'user', row.id, { name: input.name });
  return getUser(row.id);
}

export async function createAdmin(actorId: number, input: z.output<typeof adminCreateSchema>) {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true)));
  if (n >= MAX_ADMINS && !input.confirmOverLimit) {
    throw conflict(`There are already ${n} admins. Confirm to add another.`, 'ADMIN_LIMIT', {
      count: n,
      limit: MAX_ADMINS,
    });
  }
  return createUser(actorId, 'ADMIN', input);
}

async function countActiveAdmins(exceptId: number) {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true), ne(users.id, exceptId)));
  return n;
}

export async function updateUser(
  actorId: number,
  id: number,
  input: z.output<typeof staffUpdateSchema> | z.output<typeof adminUserUpdateSchema>,
  role?: Role,
): Promise<UserDto> {
  const current = await getUser(id, role);
  if (!input.isActive && id === actorId) throw badRequest('You cannot deactivate your own account');
  if (current.role === 'ADMIN' && !input.isActive && (await countActiveAdmins(id)) === 0) {
    throw badRequest('At least one active admin is required');
  }
  const db = getDb();
  await assertContactFree(db, input.mobile, input.email, id);
  const society =
    'societyId' in input || 'societyOrBuilding' in input
      ? await societyFields(
          db,
          input as { societyId?: number | null; societyOrBuilding?: string | null },
          {
            allowInactive: true,
          },
        )
      : {};
  await db
    .update(users)
    .set({ ...input, ...society, ...emailChange(current.email, input.email) })
    .where(eq(users.id, id));
  await audit(db, actorId, 'USER_UPDATED', 'user', id, {
    isActive: input.isActive,
    wasActive: current.isActive,
  });
  return getUser(id);
}

export async function resetPassword(actorId: number, id: number, password: string) {
  await getUser(id);
  const db = getDb();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, id));
  await audit(db, actorId, 'PASSWORD_RESET', 'user', id);
}

export async function listByRole(role: Role): Promise<UserDto[]> {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.role, role))
    .orderBy(desc(users.isActive), asc(users.name));
  return rows.map(toUserDto);
}
