import { LABELS } from '@shared/enums';
import type { WashLogDto } from '@shared/types';
import { useApi } from '../../api/hooks';
import { Check, Clock, X } from '../../components/icons';
import { Card, cx, EmptyState, QueryView, Tag } from '../../components/ui';
import { dayDate, timeOf } from '../../lib/format';

export function WasherHistory() {
  const q = useApi<WashLogDto[]>(['washer', 'history'], '/washer/history');
  return (
    <div className="px-5 pt-[18px] flex flex-col gap-3.5">
      <div>
        <div className="text-sm text-muted">Last 14 days</div>
        <h1 className="mt-0.5 text-[27px] font-bold tracking-[-0.5px]">History</h1>
      </div>
      <QueryView query={q}>
        {(logs) => {
          if (!logs.length) {
            return (
              <Card>
                <EmptyState icon={<Clock size={22} />} title="No entries yet">
                  Your washes show up here.
                </EmptyState>
              </Card>
            );
          }
          const byDate = new Map<string, WashLogDto[]>();
          for (const l of logs)
            byDate.set(l.serviceDate, [...(byDate.get(l.serviceDate) ?? []), l]);
          return [...byDate.entries()].map(([date, items]) => (
            <Card key={date} className="py-4">
              <div className="flex justify-between items-baseline mb-2">
                <h2 className="font-sans text-[15px] font-semibold">{dayDate(date)}</h2>
                <span className="text-[13px] text-muted">
                  {items.filter((i) => i.status === 'DONE').length} done
                </span>
              </div>
              {items.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 py-2.5 dotted-top first:border-t-0"
                >
                  <span
                    className={cx(
                      'w-6 h-6 shrink-0 rounded-full flex items-center justify-center',
                      l.status === 'DONE' ? 'bg-accent text-white' : 'bg-warn-soft text-warn-ink',
                    )}
                  >
                    {l.status === 'DONE' ? (
                      <Check size={13} strokeWidth={3.4} />
                    ) : (
                      <X size={13} strokeWidth={3} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold plate">{l.registrationNumber}</div>
                    <div className="text-[13px] text-muted truncate">
                      {l.activityName} · {timeOf(l.performedAt)}
                      {l.status === 'NOT_DONE' && l.reason ? ` · ${LABELS.reason[l.reason]}` : ''}
                    </div>
                  </div>
                  {l.isCatchUp ? <Tag tone="warn">Catch-up</Tag> : null}
                  {l.editedAt ? <Tag tone="muted">Edited</Tag> : null}
                </div>
              ))}
            </Card>
          ));
        }}
      </QueryView>
    </div>
  );
}
