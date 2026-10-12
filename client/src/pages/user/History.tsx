import { LABELS } from '@shared/enums';
import type { HistoryEntry, VehicleDto, WashLogDto } from '@shared/types';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../api/hooks';
import { qs } from '../../api/client';
import { Alert, Car, Check, ChevronLeft, ChevronRight, X } from '../../components/icons';
import {
  Button,
  Card,
  cx,
  Dot,
  EmptyState,
  LinkButton,
  PageTitle,
  QueryView,
  Tag,
} from '../../components/ui';
import { dayDate, monthLabel, timeOf } from '../../lib/format';
import { todayIst } from '../../lib/forms';

function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function EntryRow({ e }: { e: HistoryEntry }) {
  const log = e.log as WashLogDto | null;
  return (
    <div className="flex gap-3 items-start py-3 dotted-top first:border-t-0 first:pt-0">
      {e.kind === 'DONE' ? (
        <Dot>
          <Check size={13} strokeWidth={3.4} />
        </Dot>
      ) : e.kind === 'NOT_DONE' ? (
        <Dot tone="warn">
          <X size={13} strokeWidth={3} />
        </Dot>
      ) : (
        <span className="w-6 h-6 shrink-0 rounded-full bg-danger-soft text-danger flex items-center justify-center">
          <Alert size={13} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold">
          {e.activityName} {log?.isCatchUp ? <Tag>Catch-up</Tag> : null}
        </div>
        <div className="text-[13px] text-muted">
          {e.kind === 'DONE' && log
            ? `Done at ${timeOf(log.performedAt)} · ${log.washerName}`
            : null}
          {e.kind === 'NOT_DONE' && log
            ? `Not done · ${log.reason ? LABELS.reason[log.reason] : ''} · ${timeOf(log.performedAt)}`
            : null}
          {e.kind === 'MISSED' ? 'Missed — no wash recorded' : null}
          {log?.notes ? ` · “${log.notes}”` : null}
        </div>
      </div>
    </div>
  );
}

export function History() {
  const [params, setParams] = useSearchParams();
  const vehicles = useApi<VehicleDto[]>(['me', 'vehicles'], '/me/vehicles');
  const thisMonth = todayIst().slice(0, 7);
  const month = params.get('month') ?? thisMonth;
  const list = vehicles.data ?? [];
  const vehicleId = Number(params.get('vehicle')) || list[0]?.id;
  const history = useApi<{ month: string; entries: HistoryEntry[] }>(
    ['me', 'history', vehicleId, month],
    vehicleId ? `/me/wash-logs${qs({ vehicleId, month })}` : null,
  );
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <PageTitle title="Wash history" />
      <QueryView query={vehicles}>
        {(vs) =>
          vs.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Car size={24} />}
                title="No vehicles yet"
                action={
                  <LinkButton to="/app/vehicles?add=1" variant="cta">
                    Add vehicle
                  </LinkButton>
                }
              />
            </Card>
          ) : (
            <>
              {vs.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1">
                  {vs.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={v.id === vehicleId}
                      onClick={() => set('vehicle', String(v.id))}
                      className={cx(
                        'shrink-0 rounded-xl px-3 py-2 text-sm font-bold plate border',
                        v.id === vehicleId ? 'bg-white border-ink' : 'border-line text-muted',
                      )}
                    >
                      {v.registrationNumber}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center justify-between bg-white rounded-2xl p-1.5 shadow-card">
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Previous month"
                  onClick={() => set('month', shiftMonth(month, -1))}
                >
                  <ChevronLeft size={20} />
                </Button>
                <span className="font-semibold">{monthLabel(month)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Next month"
                  disabled={month >= thisMonth}
                  onClick={() => set('month', shiftMonth(month, 1))}
                >
                  <ChevronRight size={20} />
                </Button>
              </div>
              <QueryView query={history}>
                {(h) => {
                  if (!h.entries.length) {
                    return (
                      <Card>
                        <EmptyState title="Nothing this month">
                          Washes appear here as soon as your washer marks them.
                        </EmptyState>
                      </Card>
                    );
                  }
                  const byDate = new Map<string, HistoryEntry[]>();
                  for (const e of h.entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);
                  const done = h.entries.filter((e) => e.kind === 'DONE').length;
                  return (
                    <>
                      <div className="text-sm text-muted px-1">
                        {done} done · {h.entries.filter((e) => e.kind === 'NOT_DONE').length} not
                        done · {h.entries.filter((e) => e.kind === 'MISSED').length} missed
                      </div>
                      {[...byDate.entries()].map(([date, entries]) => (
                        <Card key={date} className="py-4">
                          <h2 className="text-[15px] font-semibold font-sans text-muted mb-2.5">
                            {dayDate(date)}
                          </h2>
                          {entries.map((e) => (
                            <EntryRow key={`${e.date}-${e.activityId}-${e.kind}`} e={e} />
                          ))}
                        </Card>
                      ))}
                    </>
                  );
                }}
              </QueryView>
            </>
          )
        }
      </QueryView>
    </div>
  );
}
