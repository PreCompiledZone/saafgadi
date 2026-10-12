import { LABELS, NOT_DONE_REASONS, type NotDoneReason, type WashStatus } from '@shared/enums';
import type { MissedActivity, Paged, WashLogDto } from '@shared/types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ChoiceGroup,
  EmptyState,
  Field,
  FormError,
  Input,
  PageTitle,
  QueryView,
  Sheet,
  Tag,
  Textarea,
  useToast,
} from '../../components/ui';
import { dateTime, dayDate, timeOf } from '../../lib/format';
import { todayIst } from '../../lib/forms';
import { SocietySelect, Table, Td, Tr, WasherSelect } from './parts';

function EditLogSheet({ log, onClose }: { log: WashLogDto; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<WashStatus>(log.status);
  const [reason, setReason] = useState<NotDoneReason | null>(log.reason);
  const [notes, setNotes] = useState(log.notes ?? '');
  const save = useApiMutation(
    (b: unknown) => api.put(`/admin/wash-logs/${log.id}`, b),
    [['admin']],
  );
  return (
    <Sheet open onClose={onClose} title="Correct wash entry">
      <div className="flex flex-col gap-4">
        <div>
          <div className="font-bold plate text-lg">{log.registrationNumber}</div>
          <div className="text-sm text-muted">
            {log.activityName} · {dayDate(log.serviceDate)} · logged by {log.washerName} at{' '}
            {timeOf(log.performedAt)}
          </div>
        </div>
        <ChoiceGroup<WashStatus>
          legend="Status"
          columns={2}
          options={[
            { value: 'DONE', label: 'Done' },
            { value: 'NOT_DONE', label: 'Not done' },
          ]}
          value={status}
          onChange={setStatus}
        />
        {status === 'NOT_DONE' ? (
          <ChoiceGroup<NotDoneReason>
            legend="Reason"
            columns={2}
            options={NOT_DONE_REASONS.map((r) => ({ value: r, label: LABELS.reason[r] }))}
            value={reason}
            onChange={setReason}
          />
        ) : null}
        <Field label="Notes" htmlFor="lnotes">
          <Textarea
            id="lnotes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-16"
          />
        </Field>
        <p className="text-[13px] text-muted">
          Corrections are recorded in the audit log. The monthly quota still applies.
        </p>
        <FormError error={save.error} />
        <Button
          variant="cta"
          size="lg"
          loading={save.isPending}
          disabled={status === 'NOT_DONE' && !reason}
          onClick={async () => {
            try {
              await save.mutateAsync({
                status,
                reason: status === 'NOT_DONE' ? reason : null,
                notes: notes || null,
              });
              toast('Entry corrected');
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Save correction
        </Button>
      </div>
    </Sheet>
  );
}

export function WashLogs() {
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? todayIst();
  const washerId = params.get('washerId') ?? '';
  const societyId = params.get('societyId') ?? '';
  const page = Number(params.get('page')) || 1;
  const [editing, setEditing] = useState<WashLogDto | null>(null);
  const q = useApi<{ logs: Paged<WashLogDto>; missed: MissedActivity[] }>(
    ['admin', 'wash-logs', date, washerId, societyId, page],
    `/admin/wash-logs${qs({ date, washerId, societyId, page, pageSize: 50 })}`,
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
  const isToday = date === todayIst();

  return (
    <>
      <PageTitle title="Wash logs" />
      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 items-end">
        <Field label="Date" htmlFor="wdate">
          <Input
            id="wdate"
            type="date"
            max={todayIst()}
            value={date}
            onChange={(e) => update({ date: e.target.value })}
            className="h-12"
          />
        </Field>
        <Field label="Washer" htmlFor="wwasher">
          <WasherSelect
            id="wwasher"
            emptyLabel="All washers"
            value={washerId}
            onChange={(e) => update({ washerId: e.target.value })}
            className="h-12"
          />
        </Field>
        <Field label="Society" htmlFor="wsociety">
          <SocietySelect
            id="wsociety"
            className="h-12"
            value={societyId}
            onChange={(v) => update({ societyId: v })}
          />
        </Field>
      </Card>
      <QueryView query={q}>
        {(d) => (
          <>
            <Card>
              <CardHeader title={`Entries · ${dayDate(date)}`} sub={`${d.logs.total} logged`} />
              {d.logs.items.length ? (
                <>
                  <Table
                    head={['Vehicle', 'Service', 'Status', 'Time', 'Washer', '']}
                    minWidth={760}
                  >
                    {d.logs.items.map((l) => (
                      <Tr key={l.id}>
                        <Td className="font-bold plate whitespace-nowrap">
                          {l.registrationNumber}
                        </Td>
                        <Td>
                          {l.activityName} {l.isCatchUp ? <Tag tone="warn">Catch-up</Tag> : null}
                        </Td>
                        <Td>
                          {l.status === 'DONE' ? (
                            <Badge tone="active">Done</Badge>
                          ) : (
                            <div>
                              <Badge tone="warn">Not done</Badge>
                              {l.reason ? (
                                <div className="text-xs text-muted mt-1">
                                  {LABELS.reason[l.reason]}
                                </div>
                              ) : null}
                            </div>
                          )}
                          {l.editedAt ? (
                            <div className="text-xs text-muted mt-1">
                              Edited by {l.editedByName}, {dateTime(l.editedAt)}
                            </div>
                          ) : null}
                        </Td>
                        <Td className="whitespace-nowrap">{timeOf(l.performedAt)}</Td>
                        <Td>{l.washerName}</Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(l)}>
                            Edit
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Table>
                  <Pagination
                    page={d.logs.page}
                    pageSize={d.logs.pageSize}
                    total={d.logs.total}
                    onPage={(p) => update({ page: String(p) })}
                  />
                </>
              ) : (
                <EmptyState title="No entries for this day" />
              )}
            </Card>
            <Card>
              <CardHeader
                title={isToday ? 'Due today, not logged yet' : 'Missed (due, nothing logged)'}
                sub={`${d.missed.length} ${d.missed.length === 1 ? 'service' : 'services'}`}
              />
              {d.missed.length ? (
                <Table head={['Vehicle', 'Customer', 'Service', 'Washer']} minWidth={560}>
                  {d.missed.map((m) => (
                    <Tr key={`${m.subscriptionId}-${m.activityId}`}>
                      <Td className="font-bold plate whitespace-nowrap">{m.registrationNumber}</Td>
                      <Td>{m.ownerName}</Td>
                      <Td>{m.activityName}</Td>
                      <Td>{m.washerName ?? <span className="text-danger">Not assigned</span>}</Td>
                    </Tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title={isToday ? 'Everything due is logged' : 'Nothing missed'} />
              )}
            </Card>
          </>
        )}
      </QueryView>
      {editing ? <EditLogSheet log={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
