import type { VehicleDto } from '@shared/types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Bike, Car, Edit, MapPin, Plus } from '../../components/icons';
import {
  Button,
  Card,
  EmptyState,
  PageTitle,
  Plate,
  QueryView,
  Sheet,
  useToast,
} from '../../components/ui';
import { VehicleForm, type VehicleFormValues } from '../../components/VehicleForm';
import { vehicleTypeLabel } from '../../lib/format';

export function Vehicles() {
  const q = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<VehicleDto | null>(null);
  const adding = params.get('add') === '1';
  const toast = useToast();
  const save = useApiMutation(
    (v: { id?: number; values: VehicleFormValues }) =>
      v.id ? api.put(`/me/vehicles/${v.id}`, v.values) : api.post('/me/vehicles', v.values),
    [['me']],
  );
  const close = () => {
    setEditing(null);
    if (adding) setParams({}, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <PageTitle
        title="My vehicles"
        actions={
          <Button variant="cta" size="sm" onClick={() => setParams({ add: '1' })}>
            <Plus size={18} /> Add
          </Button>
        }
      />
      <QueryView query={q}>
        {(vs) =>
          vs.length === 0 ? (
            <Card>
              <EmptyState icon={<Car size={24} />} title="No vehicles yet">
                Add your car or bike so we know what to wash and where it’s parked.
              </EmptyState>
            </Card>
          ) : (
            vs.map((v) => (
              <Card key={v.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-10 h-10 shrink-0 rounded-xl bg-accent-soft text-accent-ink flex items-center justify-center">
                      {v.category === 'CAR' ? <Car size={22} /> : <Bike size={22} />}
                    </span>
                    <div className="min-w-0">
                      <Plate size="sm">{v.registrationNumber}</Plate>
                      <div className="text-sm text-muted mt-1 truncate">
                        {v.make} {v.model} · {vehicleTypeLabel(v.vehicleType)} · {v.color}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(v)}
                    aria-label={`Edit ${v.registrationNumber}`}
                  >
                    <Edit size={16} /> Edit
                  </Button>
                </div>
                {v.parkingNotes ? (
                  <div className="flex gap-2 items-center text-sm bg-canvas rounded-[10px] px-2.5 py-2">
                    <MapPin size={16} className="text-muted shrink-0" />
                    {v.parkingNotes}
                  </div>
                ) : null}
                {!v.isActive ? (
                  <div className="text-sm text-danger font-medium">Deactivated — contact us</div>
                ) : null}
              </Card>
            ))
          )
        }
      </QueryView>

      <Sheet
        open={adding || !!editing}
        onClose={close}
        title={editing ? 'Edit vehicle' : 'Add a vehicle'}
      >
        <VehicleForm
          key={editing?.id ?? 'new'}
          defaultValues={editing ?? undefined}
          lockIdentity={editing?.hasSubscription}
          submitLabel={editing ? 'Save changes' : 'Add vehicle'}
          onSubmit={async (values) => {
            await save.mutateAsync({ id: editing?.id, values });
            toast(editing ? 'Vehicle updated' : 'Vehicle added');
            close();
          }}
        />
      </Sheet>
    </div>
  );
}
