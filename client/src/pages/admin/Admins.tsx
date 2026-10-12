import type { UserDto } from '@shared/types';
import { useState } from 'react';
import { useApi } from '../../api/hooks';
import { Plus } from '../../components/icons';
import { Badge, Button, Card, Notice, PageTitle, QueryView } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { useSession } from '../../lib/auth';
import { CreateAccountSheet, ResetPasswordSheet } from './Users';
import { EditStaffSheet } from './Washers';

const MAX_ADMINS = 2;

export function Admins() {
  const q = useApi<UserDto[]>(['admin', 'admins'], '/admin/admins');
  const { user: me } = useSession();
  const [creating, setCreating] = useState(false);
  const [confirmOver, setConfirmOver] = useState(false);
  const [editing, setEditing] = useState<UserDto | null>(null);
  const [resetting, setResetting] = useState<UserDto | null>(null);
  const activeCount = (q.data ?? []).filter((a) => a.isActive).length;
  const atLimit = activeCount >= MAX_ADMINS;

  return (
    <>
      <PageTitle
        title="Admins"
        actions={
          <Button
            variant="cta"
            className="h-[46px] rounded-xl"
            onClick={() => (atLimit ? setConfirmOver(true) : setCreating(true))}
          >
            <Plus size={18} /> Add admin
          </Button>
        }
      />
      {confirmOver ? (
        <Card className="flex flex-col gap-3">
          <Notice tone="warn">
            There are already {activeCount} active admins. {MAX_ADMINS} is the recommended maximum —
            every admin can see all customer data and payments.
          </Notice>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmOver(false);
                setCreating(true);
              }}
            >
              Add another anyway
            </Button>
            <Button variant="ghost" onClick={() => setConfirmOver(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      ) : null}
      <QueryView query={q}>
        {(list) => (
          <div className="grid gap-3.5 md:grid-cols-2">
            {list.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <div className="font-display font-semibold text-lg">
                      {a.name}{' '}
                      {a.id === me?.id ? (
                        <span className="text-sm text-muted font-sans">(you)</span>
                      ) : null}
                    </div>
                    <div className="text-sm text-muted">
                      {a.mobile}
                      {a.email ? ` · ${a.email}` : ''}
                    </div>
                    <div className="text-[13px] text-muted mt-1">
                      {a.lastLoginAt ? `Last login ${dateTime(a.lastLoginAt)}` : 'Never logged in'}
                    </div>
                  </div>
                  {a.isActive ? (
                    <Badge tone="active">Active</Badge>
                  ) : (
                    <Badge tone="muted">Deactivated</Badge>
                  )}
                </div>
                <div className="flex gap-1.5 justify-end dotted-top pt-3">
                  <Button size="sm" variant="ghost" onClick={() => setResetting(a)}>
                    Reset password
                  </Button>
                  <Button size="sm" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryView>
      <CreateAccountSheet
        open={creating}
        onClose={() => setCreating(false)}
        title="Add admin"
        endpoint="/admin/admins"
        extraBody={{ confirmOverLimit: atLimit }}
      />
      {editing ? (
        <EditStaffSheet
          user={editing}
          endpoint={`/admin/admins/${editing.id}`}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {resetting ? (
        <ResetPasswordSheet
          user={resetting}
          endpoint={`/admin/admins/${resetting.id}/reset-password`}
          onClose={() => setResetting(null)}
        />
      ) : null}
    </>
  );
}
