import type { AuditAction } from '../../shared/enums';
import type { DbOrTx } from '../db';
import { auditLog } from '../db/schema';

export async function audit(
  db: DbOrTx,
  actorId: number | null,
  action: AuditAction,
  entity: string,
  entityId: number | null,
  details?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ actorId, action, entity, entityId, details: details ?? null });
}
