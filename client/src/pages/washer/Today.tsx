import { LABELS, NOT_DONE_REASONS, type NotDoneReason, type WashStatus } from '@shared/enums';
import type { WasherToday, WasherTodayActivity, WasherTodayItem, WashLogDto } from '@shared/types';
import { useState } from 'react';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Check, CheckCircle, ChevronRight, MapPin, X } from '../../components/icons';
import {
  Button,
  cx,
  EmptyState,
  FormError,
  QueryView,
  Sheet,
  Tag,
  Textarea,
  useToast,
} from '../../components/ui';
import { dayDate, firstName, shortName, timeOf, vehicleTypeLabel } from '../../lib/format';

type LogBody = { status: WashStatus; reason?: NotDoneReason | null; notes?: string | null };

function useLogMutations() {
  const create = useApiMutation(
    (b: LogBody & { subscriptionId: number; planActivityId: number }) =>
      api.post<WashLogDto>('/washer/logs', b),
    [['washer']],
  );
  const update = useApiMutation(
    (b: LogBody & { id: number }) => {
      const { id, ...body } = b;
      return api.put<WashLogDto>(`/washer/logs/${id}`, body);
    },
    [['washer']],
  );
  return { create, update };
}

/** Reason picker for "Not done", also used to change an entry. */
function LogSheet({
  target,
  onClose,
  onSaved,
}: {
  target: {
    item: WasherTodayItem;
    activity: WasherTodayActivity;
    mode: 'not-done' | 'change';
  } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { create, update } = useLogMutations();
  const toast = useToast();
  const [reason, setReason] = useState<NotDoneReason | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState<WashStatus | null>(null);
  if (!target) return null;
  const { item, activity, mode } = target;
  const log = activity.log;

  async function submit(status: WashStatus) {
    if (status === 'NOT_DONE' && !reason) {
      setError(new Error('Choose a reason'));
      return;
    }
    setBusy(status);
    setError(null);
    try {
      const body = {
        status,
        reason: status === 'NOT_DONE' ? reason : null,
        notes: notes.trim() || null,
      };
      if (log) await update.mutateAsync({ id: log.id, ...body });
      else
        await create.mutateAsync({
          subscriptionId: item.subscriptionId,
          planActivityId: activity.activityId,
          ...body,
        });
      toast(
        status === 'DONE'
          ? `${item.registrationNumber} marked done`
          : `${item.registrationNumber} marked not done`,
      );
      onSaved();
    } catch (err) {
      setError(err as Error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'change' ? 'Change entry' : 'Why wasn’t it done?'}
    >
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-[22px] font-bold plate">{item.registrationNumber}</div>
          <div className="text-sm text-muted">{activity.name}</div>
        </div>
        {mode === 'change' && log?.status === 'NOT_DONE' ? (
          <Button variant="cta" size="lg" loading={busy === 'DONE'} onClick={() => submit('DONE')}>
            <Check size={20} strokeWidth={2.6} /> Mark as done
          </Button>
        ) : null}
        <fieldset className="border-0 p-0 m-0">
          <legend className="font-semibold text-sm mb-2.5">
            {mode === 'change' && log?.status === 'NOT_DONE' ? 'Or update the reason' : 'Reason'}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {NOT_DONE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={cx(
                  'min-h-14 rounded-[14px] px-3 text-[15px] text-left',
                  reason === r
                    ? 'border-2 border-accent bg-accent-soft font-semibold text-accent-deep'
                    : 'border border-line bg-white',
                )}
              >
                {LABELS.reason[r]}
              </button>
            ))}
          </div>
        </fieldset>
        <Textarea
          aria-label="Note (optional)"
          placeholder="Note (optional), e.g. car covered"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-20"
        />
        <FormError error={error} />
        <Button
          variant="secondary"
          size="lg"
          loading={busy === 'NOT_DONE'}
          onClick={() => submit('NOT_DONE')}
        >
          Save as not done
        </Button>
      </div>
    </Sheet>
  );
}

function ActivityRow({
  item,
  a,
  onNotDone,
  onChange,
  onLogged,
}: {
  item: WasherTodayItem;
  a: WasherTodayActivity;
  onNotDone: () => void;
  onChange: () => void;
  onLogged: () => void;
}) {
  const { create } = useLogMutations();
  const toast = useToast();
  const [error, setError] = useState<Error | null>(null);

  if (a.log) {
    const done = a.log.status === 'DONE';
    return (
      <div className="dotted-top pt-3 flex items-center gap-3">
        <span
          className={cx(
            'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
            done ? 'bg-accent text-white' : 'bg-warn-soft text-warn-ink',
          )}
        >
          {done ? <Check size={15} strokeWidth={3.4} /> : <X size={15} strokeWidth={3} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[15px]">{done ? a.name : 'Not done'}</div>
          <div className="text-[13px] text-muted">
            {done
              ? `Done at ${timeOf(a.log.performedAt)} · ${a.used} of ${a.quota}`
              : `${a.log.reason ? LABELS.reason[a.log.reason] : ''} · ${timeOf(a.log.performedAt)}`}
            {a.log.isCatchUp ? ' · catch-up' : ''}
          </div>
        </div>
        <Button size="sm" className="h-11" variant="secondary" onClick={onChange}>
          <span className="text-accent-ink">Change</span>
        </Button>
      </div>
    );
  }

  const tag =
    a.state === 'PENDING' ? (
      <Tag tone="warn">Catch-up</Tag>
    ) : a.minGapDays <= 1 ? (
      <Tag>Pending this month</Tag>
    ) : (
      <span className="text-muted">
        {a.used} of {a.quota}
      </span>
    );

  return (
    <div className="dotted-top pt-3 flex flex-col gap-2">
      <div className="flex justify-between items-center gap-2 text-[15px]">
        <span className="font-semibold">{a.name}</span>
        {tag}
      </div>
      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <Button
          variant="cta"
          className="h-[54px] text-base font-bold"
          loading={create.isPending}
          onClick={async () => {
            setError(null);
            try {
              await create.mutateAsync({
                subscriptionId: item.subscriptionId,
                planActivityId: a.activityId,
                status: 'DONE',
              });
              toast(`${item.registrationNumber} · ${a.name} done`);
              onLogged();
            } catch (err) {
              setError(err as Error);
            }
          }}
        >
          <CheckCircle size={20} /> Done
        </Button>
        <Button variant="secondary" className="h-[54px] border-line-strong" onClick={onNotDone}>
          Not done
        </Button>
      </div>
      <FormError error={error} />
    </div>
  );
}

function vehicleSummary(item: WasherTodayItem) {
  return `${item.vehicleLabel.split(' · ')[0]} · ${vehicleTypeLabel(item.vehicleType)} · ${item.color}`;
}

function location(item: WasherTodayItem) {
  return [item.flatOrHouseNo && `Flat ${item.flatOrHouseNo}`, item.parkingNotes]
    .filter(Boolean)
    .join(' · ');
}

/** Compact list row; tapping it opens the vehicle's actions. */
function VehicleRow({ item, onOpen }: { item: WasherTodayItem; onOpen: () => void }) {
  const toDo = item.activities.filter((a) => !a.log).length;
  const notDone = item.activities.some((a) => a.log?.status === 'NOT_DONE');
  const where = location(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'w-full text-left bg-white rounded-[16px] px-4 py-3 shadow-card flex items-center gap-3',
        toDo === 0 && 'opacity-70',
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="text-lg font-bold plate">{item.registrationNumber}</div>
        <div className="text-[13px] text-muted truncate">
          {vehicleSummary(item)} · {shortName(item.ownerName)}
        </div>
        {where ? <div className="text-[13px] text-muted truncate">{where}</div> : null}
      </div>
      {toDo > 0 ? (
        <Tag
          tone={item.activities.some((a) => !a.log && a.state === 'PENDING') ? 'warn' : undefined}
        >
          {toDo} to do
        </Tag>
      ) : notDone ? (
        <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-warn-soft text-warn-ink">
          <X size={15} strokeWidth={3} />
        </span>
      ) : (
        <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-accent text-white">
          <Check size={15} strokeWidth={3.4} />
        </span>
      )}
      <ChevronRight size={18} className="text-muted shrink-0" />
    </button>
  );
}

/** Vehicle details with the Done / Not done / Change actions. */
function VehicleSheet({
  item,
  onClose,
  onLog,
}: {
  item: WasherTodayItem;
  onClose: () => void;
  onLog: (a: WasherTodayActivity, mode: 'not-done' | 'change') => void;
}) {
  const where = location(item);
  return (
    <Sheet open onClose={onClose} title={item.registrationNumber}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="text-sm text-muted">
          {vehicleSummary(item)} · {shortName(item.ownerName)}
        </div>
        {where ? (
          <div className="flex gap-2 items-center text-sm bg-white rounded-[10px] px-2.5 py-2">
            <MapPin size={18} className="text-muted shrink-0" />
            <span>{where}</span>
          </div>
        ) : null}
        {item.activities.map((a) => (
          <ActivityRow
            key={a.activityId}
            item={item}
            a={a}
            onNotDone={() => onLog(a, 'not-done')}
            onChange={() => onLog(a, 'change')}
            onLogged={() => {
              // Close once this was the last activity left to log.
              if (item.activities.every((x) => x.log || x.activityId === a.activityId)) onClose();
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}

export function Today() {
  const q = useApi<WasherToday>(['washer', 'today'], '/washer/today', { refetchInterval: 120_000 });
  const [sheet, setSheet] = useState<{
    subscriptionId: number;
    log?: { activityId: number; mode: 'not-done' | 'change' };
  } | null>(null);

  return (
    <QueryView query={q}>
      {(d) => {
        const total = d.counts.toDo + d.counts.done + d.counts.notDone;
        const pct = total ? Math.round(((d.counts.done + d.counts.notDone) / total) * 100) : 0;
        // Resolve the open sheet against fresh data.
        const openItem = sheet
          ? d.groups.flatMap((g) => g.items).find((i) => i.subscriptionId === sheet.subscriptionId)
          : undefined;
        const openActivity = sheet?.log
          ? openItem?.activities.find((a) => a.activityId === sheet.log!.activityId)
          : undefined;
        return (
          <>
            <div
              role="progressbar"
              aria-label="Today’s progress"
              aria-valuenow={d.counts.done + d.counts.notDone}
              aria-valuemin={0}
              aria-valuemax={total}
              className="h-1 bg-line sticky top-0 z-10"
            >
              <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <header className="px-5 pt-[18px] pb-2 flex flex-col gap-3.5">
              <div>
                <div className="text-sm text-muted">
                  Hi {firstName(d.washerName)} · {dayDate(d.today)}
                </div>
                <h1 className="mt-0.5 text-[27px] font-bold tracking-[-0.5px]">Today’s washes</h1>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['To do', d.counts.toDo, ''],
                  ['Done', d.counts.done, 'text-accent-ink'],
                  ['Not done', d.counts.notDone, ''],
                ].map(([label, n, cls]) => (
                  <div key={label as string} className="bg-white rounded-[14px] px-3 py-2.5">
                    <div className={cx('font-display text-[22px] font-bold', cls as string)}>
                      {n}
                    </div>
                    <div className="text-xs text-muted">{label}</div>
                  </div>
                ))}
              </div>
            </header>
            <div className="px-4 pt-2 flex flex-col gap-3">
              {d.groups.length === 0 ? (
                <div className="bg-white rounded-[20px] shadow-card mt-2">
                  <EmptyState icon={<CheckCircle size={24} />} title="Nothing to wash right now">
                    Vehicles assigned to you appear here on the days they’re due.
                  </EmptyState>
                </div>
              ) : (
                d.groups.map((g) => (
                  <section key={g.society} className="flex flex-col gap-3">
                    <h2 className="mt-2 mx-1 font-sans text-[13px] font-semibold text-muted tracking-[1.2px] uppercase">
                      {g.society}
                    </h2>
                    {g.items.map((item) => (
                      <VehicleRow
                        key={item.subscriptionId}
                        item={item}
                        onOpen={() => setSheet({ subscriptionId: item.subscriptionId })}
                      />
                    ))}
                  </section>
                ))
              )}
            </div>
            {openItem && sheet && !sheet.log ? (
              <VehicleSheet
                item={openItem}
                onClose={() => setSheet(null)}
                onLog={(a, mode) =>
                  setSheet({
                    subscriptionId: openItem.subscriptionId,
                    log: { activityId: a.activityId, mode },
                  })
                }
              />
            ) : null}
            <LogSheet
              key={
                sheet?.log
                  ? `${sheet.subscriptionId}-${sheet.log.activityId}-${sheet.log.mode}`
                  : 'none'
              }
              target={
                openItem && openActivity && sheet?.log
                  ? { item: openItem, activity: openActivity, mode: sheet.log.mode }
                  : null
              }
              onClose={() => setSheet(sheet ? { subscriptionId: sheet.subscriptionId } : null)}
              onSaved={() => setSheet(null)}
            />
          </>
        );
      }}
    </QueryView>
  );
}
