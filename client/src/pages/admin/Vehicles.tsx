import { LABELS } from '@shared/enums';
import type { Paged, SubscriptionDto, VehicleDto } from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { StatusBadge } from '../../components/status';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  PageTitle,
  QueryView,
  Sheet,
  useToast,
} from '../../components/ui';
import { VehicleForm } from '../../components/VehicleForm';
import { shortDate } from '../../lib/format';
import { SubscriptionActions } from './Subscriptions';
import { SearchBox, SocietySelect, Table, Td, Tr } from './parts';

type Row = VehicleDto & { current: SubscriptionDto | null };

export function AdminVehicleSheet({
  vehicle,
  onClose,
}: {
  vehicle: VehicleDto;
  onClose: () => void;
}) {
  const toast = useToast();
  const [isActive, setIsActive] = useState(vehicle.isActive);
  const save = useApiMutation(
    (v: unknown) => api.put(`/admin/vehicles/${vehicle.id}`, v),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title={`Edit ${vehicle.registrationNumber}`}>
      <div className="flex flex-col gap-5">
        <Checkbox
          label="Vehicle is active"
          hint="Inactive vehicles can't get new plans"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <VehicleForm
          defaultValues={vehicle}
          submitLabel="Save vehicle"
          onSubmit={async (values) => {
            await save.mutateAsync({ ...values, isActive });
            toast('Vehicle saved');
            onClose();
          }}
        />
      </div>
    </Sheet>
  );
}

export function AdminVehicles() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') ?? '';
  const societyId = params.get('societyId') ?? '';
  const page = Number(params.get('page')) || 1;
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const q = useApi<Paged<Row>>(
    ['admin', 'vehicles', search, societyId, page],
    `/admin/vehicles${qs({ search, societyId, page, pageSize: 25 })}`,
  );
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };
  return (
    <>
      <PageTitle title="Vehicles" />
      <div className="flex flex-col sm:flex-row gap-2.5">
        <SocietySelect
          className="h-12 sm:w-64"
          value={societyId}
          onChange={(v) => update({ societyId: v })}
        />
        <SearchBox
          className="md:w-96"
          value={search}
          onChange={(v) => update({ search: v })}
          placeholder="Vehicle number, owner, make"
        />
      </div>
      <Card>
        <QueryView query={q}>
          {(d) =>
            d.items.length ? (
              <>
                <Table head={['Vehicle', 'Owner', 'Parking', 'Plan', 'Washer', '']} minWidth={900}>
                  {d.items.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <div className="font-bold plate whitespace-nowrap">
                          {v.registrationNumber}
                        </div>
                        <div className="text-xs text-muted">
                          {v.make} {v.model} · {LABELS.vehicleType[v.vehicleType]} · {v.color}
                          {!v.isActive ? ' · inactive' : ''}
                        </div>
                      </Td>
                      <Td>
                        <Link
                          to={`/admin/users/${v.userId}`}
                          className="font-semibold no-underline"
                        >
                          {v.ownerName}
                        </Link>
                        <div className="text-xs text-muted">{v.ownerMobile}</div>
                      </Td>
                      <Td className="max-w-48 truncate">{v.parkingNotes ?? '—'}</Td>
                      <Td>
                        {v.current ? (
                          <div className="flex flex-col gap-1 items-start">
                            <StatusBadge
                              status={v.current.displayStatus}
                              daysLeft={v.current.daysLeft}
                            />
                            <span className="text-xs text-muted whitespace-nowrap">
                              {v.current.planName} · till {shortDate(v.current.endDate)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted">No plan</span>
                        )}
                      </Td>
                      <Td>
                        {v.current
                          ? (v.current.assignedWasherName ?? (
                              <span className="text-danger">Not assigned</span>
                            ))
                          : '—'}
                      </Td>
                      <Td>
                        <div className="flex gap-1 justify-end">
                          {v.current ? <SubscriptionActions s={v.current} /> : null}
                          <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>
                            Edit
                          </Button>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Table>
                <Pagination
                  page={d.page}
                  pageSize={d.pageSize}
                  total={d.total}
                  onPage={(p) => update({ page: String(p) })}
                />
              </>
            ) : (
              <EmptyState title="No vehicles found" />
            )
          }
        </QueryView>
      </Card>
      {editing ? <AdminVehicleSheet vehicle={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
