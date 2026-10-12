import { LABELS } from '@shared/enums';
import type { AdminUserDetail, SocietyDto, UserDto, VehicleDto } from '@shared/types';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Edit, Phone, Plus, WhatsApp } from '../../components/icons';
import {
  AnchorButton,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageTitle,
  Plate,
  QueryView,
  Select,
  Sheet,
  useToast,
} from '../../components/ui';
import { VehicleForm } from '../../components/VehicleForm';
import { telTo, whatsappTo } from '../../lib/contact';
import { dateTime, fullDate, money } from '../../lib/format';
import { EnquiryStatusBadge } from '../user/Enquiries';
import { AdminVehicleSheet } from './Vehicles';
import { ResetPasswordSheet } from './Users';
import { SubscriptionRows } from './Subscriptions';
import { useSocieties } from './Societies';
import { Table, Td, Tr } from './parts';

function SocietyPicker({ user, society }: { user: UserDto; society: SocietyDto | null }) {
  const toast = useToast();
  const societies = useSocieties();
  const save = useApiMutation(
    (societyId: number | null) =>
      api.put(`/admin/users/${user.id}`, {
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        isActive: user.isActive,
        societyId,
        ...(societyId ? {} : { societyOrBuilding: user.societyOrBuilding }),
      }),
    [['admin']],
  );
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Society:</span>
      {society ? (
        <Link to={`/admin/societies/${society.id}`} className="font-semibold no-underline">
          {society.name}
        </Link>
      ) : (
        <Badge tone="warn">
          {user.societyOrBuilding ? `“${user.societyOrBuilding}” — not onboarded` : 'None'}
        </Badge>
      )}
      <Select
        aria-label="Change society"
        className="h-10 w-auto min-w-48 text-sm"
        value={society?.id ?? ''}
        disabled={save.isPending}
        onChange={async (e) => {
          await save.mutateAsync(e.target.value ? Number(e.target.value) : null);
          toast('Society updated');
        }}
      >
        <option value="">{society ? 'Unlink from society' : 'Link to a society…'}</option>
        {(societies.data ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {s.area}
          </option>
        ))}
      </Select>
      {society?.defaultWasherName ? (
        <span className="text-muted">Default washer: {society.defaultWasherName}</span>
      ) : null}
    </div>
  );
}

function ProfileCard({ user, society }: { user: UserDto; society: SocietyDto | null }) {
  const toast = useToast();
  const [resetting, setResetting] = useState(false);
  const toggle = useApiMutation(
    (isActive: boolean) =>
      api.put(`/admin/users/${user.id}`, {
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        isActive,
      }),
    [['admin']],
  );
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <div className="text-sm text-muted">
            {user.mobile}
            {user.email ? ` · ${user.email}` : ''}
          </div>
          <div className="text-[15px] mt-1">
            {[
              user.flatOrHouseNo,
              user.societyOrBuilding,
              user.addressLine,
              user.area,
              user.city,
              user.pincode,
            ]
              .filter(Boolean)
              .join(', ') || 'No address'}
          </div>
          <div className="mt-2">
            <SocietyPicker user={user} society={society} />
          </div>
          <div className="text-[13px] text-muted mt-1">
            Joined {fullDate(user.createdAt.slice(0, 10))}
            {user.lastLoginAt ? ` · last login ${dateTime(user.lastLoginAt)}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <AnchorButton
            size="sm"
            href={whatsappTo(user.mobile)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsApp size={16} className="text-accent-ink" /> WhatsApp
          </AnchorButton>
          <AnchorButton size="sm" href={telTo(user.mobile)}>
            <Phone size={16} className="text-accent-ink" /> Call
          </AnchorButton>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 dotted-top pt-3">
        {user.isActive ? (
          <Badge tone="active">Active</Badge>
        ) : (
          <Badge tone="muted">Deactivated</Badge>
        )}
        <span className="flex-1" />
        <Button size="sm" onClick={() => setResetting(true)}>
          Reset password
        </Button>
        <Button
          size="sm"
          variant={user.isActive ? 'danger' : 'secondary'}
          loading={toggle.isPending}
          onClick={async () => {
            await toggle.mutateAsync(!user.isActive);
            toast(user.isActive ? 'Account deactivated' : 'Account activated');
          }}
        >
          {user.isActive ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      {resetting ? (
        <ResetPasswordSheet
          user={user}
          endpoint={`/admin/users/${user.id}/reset-password`}
          onClose={() => setResetting(false)}
        />
      ) : null}
    </Card>
  );
}

export function UserDetail() {
  const id = Number(useParams().id);
  const q = useApi<AdminUserDetail>(['admin', 'users', id], `/admin/users/${id}`);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const toast = useToast();
  const addVehicle = useApiMutation(
    (v: unknown) => api.post(`/admin/users/${id}/vehicles`, v),
    [['admin']],
  );

  return (
    <QueryView query={q}>
      {(d) => (
        <>
          <PageTitle
            eyebrow={<Link to="/admin/users">Users</Link>}
            title={d.user.name}
            actions={
              <>
                <LinkButton
                  to={`/admin/payments?record=1&userId=${d.user.id}`}
                  className="h-[46px] rounded-xl"
                >
                  Record payment
                </LinkButton>
                <LinkButton
                  to={`/admin/subscriptions/activate?userId=${d.user.id}`}
                  variant="cta"
                  className="h-[46px] rounded-xl"
                >
                  <Plus size={18} /> Activate plan
                </LinkButton>
              </>
            }
          />
          <ProfileCard user={d.user} society={d.society} />

          <Card>
            <CardHeader
              title="Vehicles"
              action={
                <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                  <Plus size={16} /> Add vehicle
                </Button>
              }
            />
            {d.vehicles.length ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {d.vehicles.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-3 bg-canvas rounded-[14px] p-3"
                  >
                    <div className="min-w-0">
                      <Plate size="sm">{v.registrationNumber}</Plate>
                      <div className="text-[13px] text-muted mt-1 truncate">
                        {v.make} {v.model} · {LABELS.vehicleType[v.vehicleType]} · {v.color}
                        {!v.isActive ? ' · deactivated' : ''}
                      </div>
                      {v.parkingNotes ? (
                        <div className="text-[13px] text-muted truncate">{v.parkingNotes}</div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Edit ${v.registrationNumber}`}
                      onClick={() => setEditing(v)}
                    >
                      <Edit size={16} />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No vehicles" />
            )}
          </Card>

          <Card>
            <CardHeader title="Subscriptions" />
            {d.subscriptions.length ? (
              <SubscriptionRows items={d.subscriptions} />
            ) : (
              <EmptyState title="No subscriptions yet" />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Payments"
                sub={
                  d.payments.length
                    ? `${money(d.payments.reduce((a, p) => a + p.amount, 0))} in total`
                    : undefined
                }
              />
              {d.payments.length ? (
                <Table head={['Paid on', 'Amount', 'Mode', 'For']} minWidth={420}>
                  {d.payments.map((p) => (
                    <Tr key={p.id}>
                      <Td className="whitespace-nowrap">{fullDate(p.paidOn)}</Td>
                      <Td className="font-semibold">{money(p.amount)}</Td>
                      <Td>
                        {LABELS.paymentMode[p.mode]}
                        {p.reference ? (
                          <div className="text-xs text-muted">{p.reference}</div>
                        ) : null}
                      </Td>
                      <Td>{p.registrationNumber ?? 'Advance'}</Td>
                    </Tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="No payments" />
              )}
            </Card>
            <Card>
              <CardHeader title="Enquiries" />
              {d.enquiries.length ? (
                d.enquiries.map((e) => (
                  <div
                    key={e.id}
                    className="flex justify-between gap-3 py-2.5 dotted-top first:border-t-0"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {LABELS.enquiryType[e.type]}
                        {e.planName ? ` · ${e.planName}` : ''}
                      </div>
                      <div className="text-[13px] text-muted">
                        {[e.registrationNumber, dateTime(e.createdAt)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <EnquiryStatusBadge status={e.status} />
                  </div>
                ))
              ) : (
                <EmptyState title="No enquiries" />
              )}
            </Card>
          </div>

          <Sheet open={adding} onClose={() => setAdding(false)} title="Add vehicle">
            <VehicleForm
              submitLabel="Add vehicle"
              onSubmit={async (v) => {
                await addVehicle.mutateAsync(v);
                toast('Vehicle added');
                setAdding(false);
              }}
            />
          </Sheet>
          {editing ? (
            <AdminVehicleSheet vehicle={editing} onClose={() => setEditing(null)} />
          ) : null}
        </>
      )}
    </QueryView>
  );
}
