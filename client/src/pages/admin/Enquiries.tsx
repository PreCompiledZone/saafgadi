import { ENQUIRY_STATUSES, LABELS, type EnquiryStatus } from '@shared/enums';
import type { EnquiryDto, Paged } from '@shared/types';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Pagination } from '../../components/Pagination';
import { Phone, WhatsApp } from '../../components/icons';
import {
  AnchorButton,
  Button,
  Card,
  ChoiceGroup,
  EmptyState,
  Field,
  FormError,
  LinkButton,
  PageTitle,
  QueryView,
  Sheet,
  Textarea,
  useToast,
} from '../../components/ui';
import { telTo, whatsappTo } from '../../lib/contact';
import { dateTime, firstName } from '../../lib/format';
import { EnquiryStatusBadge } from '../user/Enquiries';
import { FilterTabs } from './parts';

function UpdateSheet({ e, onClose }: { e: EnquiryDto; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<EnquiryStatus>(e.status === 'OPEN' ? 'CONTACTED' : e.status);
  const [notes, setNotes] = useState(e.adminNotes ?? '');
  const save = useApiMutation((b: unknown) => api.put(`/admin/enquiries/${e.id}`, b), [['admin']]);
  return (
    <Sheet open onClose={onClose} title="Update enquiry">
      <div className="flex flex-col gap-4">
        <ChoiceGroup<EnquiryStatus>
          legend="Status"
          options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: LABELS.enquiryStatus[s] }))}
          value={status}
          onChange={setStatus}
        />
        <Field label="Notes" htmlFor="enotes">
          <Textarea
            id="enotes"
            value={notes}
            onChange={(ev) => setNotes(ev.target.value)}
            placeholder="Called, will pay on Monday"
          />
        </Field>
        <FormError error={save.error} />
        <Button
          variant="cta"
          size="lg"
          loading={save.isPending}
          onClick={async () => {
            try {
              await save.mutateAsync({ status, adminNotes: notes || null });
              toast('Enquiry updated');
              onClose();
            } catch {
              /* shown */
            }
          }}
        >
          Save
        </Button>
      </div>
    </Sheet>
  );
}

export function AdminEnquiries() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'OPEN') as EnquiryStatus | 'ALL';
  const page = Number(params.get('page')) || 1;
  const [editing, setEditing] = useState<EnquiryDto | null>(null);
  const q = useApi<Paged<EnquiryDto>>(
    ['admin', 'enquiries', status, page],
    `/admin/enquiries${qs({ status: status === 'ALL' ? '' : status, page, pageSize: 25 })}`,
  );
  return (
    <>
      <PageTitle title="Enquiries" />
      <FilterTabs
        value={status}
        options={[
          ...ENQUIRY_STATUSES.map((s) => ({ value: s, label: LABELS.enquiryStatus[s] })),
          { value: 'ALL' as const, label: 'All' },
        ]}
        onChange={(v) => setParams({ status: v }, { replace: true })}
      />
      <QueryView query={q}>
        {(d) =>
          d.items.length ? (
            <>
              {d.items.map((e) => {
                const msg = e.userName
                  ? `Hi ${firstName(e.userName)}, this is about your ${LABELS.enquiryType[e.type].toLowerCase()} enquiry${e.planName ? ` for ${e.planName}` : ''}.`
                  : '';
                return (
                  <Card key={e.id} className="flex flex-col gap-3">
                    <div className="flex flex-wrap justify-between gap-3 items-start">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {e.userId ? (
                            <Link to={`/admin/users/${e.userId}`} className="no-underline">
                              {e.userName}
                            </Link>
                          ) : (
                            'Guest'
                          )}{' '}
                          · {LABELS.enquiryType[e.type]}
                          {e.planName ? ` · ${e.planName}` : ''}
                        </div>
                        <div className="text-[13px] text-muted">
                          {[
                            e.userMobile,
                            e.registrationNumber && `${e.registrationNumber} (${e.vehicleLabel})`,
                            dateTime(e.createdAt),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                      <EnquiryStatusBadge status={e.status} />
                    </div>
                    {e.message ? (
                      <p className="text-sm whitespace-pre-line bg-canvas rounded-xl px-3.5 py-3">
                        {e.message}
                      </p>
                    ) : null}
                    {e.adminNotes ? (
                      <p className="text-sm text-muted">
                        <b className="text-ink">
                          Notes{e.handledByName ? ` (${e.handledByName})` : ''}:
                        </b>{' '}
                        {e.adminNotes}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2 dotted-top pt-3">
                      {e.userMobile ? (
                        <>
                          <AnchorButton
                            size="sm"
                            href={whatsappTo(e.userMobile, msg)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <WhatsApp size={16} className="text-accent-ink" /> WhatsApp
                          </AnchorButton>
                          <AnchorButton size="sm" href={telTo(e.userMobile)}>
                            <Phone size={16} className="text-accent-ink" /> Call
                          </AnchorButton>
                        </>
                      ) : null}
                      <span className="flex-1" />
                      <Button size="sm" onClick={() => setEditing(e)}>
                        Update status
                      </Button>
                      {e.userId && e.vehicleId && e.status !== 'CLOSED' ? (
                        <LinkButton
                          size="sm"
                          variant="cta"
                          to={`/admin/subscriptions/activate?userId=${e.userId}&vehicleId=${e.vehicleId}${e.planId ? `&planId=${e.planId}` : ''}&enquiryId=${e.id}`}
                        >
                          Activate
                        </LinkButton>
                      ) : null}
                    </div>
                  </Card>
                );
              })}
              <Pagination
                page={d.page}
                pageSize={d.pageSize}
                total={d.total}
                onPage={(p) => setParams({ status, page: String(p) })}
              />
            </>
          ) : (
            <Card>
              <EmptyState title="No enquiries here" />
            </Card>
          )
        }
      </QueryView>
      {editing ? <UpdateSheet e={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
