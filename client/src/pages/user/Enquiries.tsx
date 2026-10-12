import { LABELS } from '@shared/enums';
import type { EnquiryDto, Paged } from '@shared/types';
import { useApi } from '../../api/hooks';
import { Message } from '../../components/icons';
import { Badge, Card, EmptyState, LinkButton, PageTitle, QueryView } from '../../components/ui';
import { dateTime } from '../../lib/format';
import { ContactButtons } from '../../components/contact';

export function EnquiryStatusBadge({ status }: { status: EnquiryDto['status'] }) {
  const tone = status === 'OPEN' ? 'accent' : status === 'CONTACTED' ? 'warn' : 'muted';
  return <Badge tone={tone}>{LABELS.enquiryStatus[status]}</Badge>;
}

export function Enquiries() {
  const q = useApi<Paged<EnquiryDto>>(['me', 'enquiries'], '/me/enquiries?pageSize=50');
  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <PageTitle title="My enquiries" />
      <QueryView query={q}>
        {(page) =>
          page.items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Message size={22} />}
                title="No enquiries yet"
                action={
                  <LinkButton to="/app/plans" variant="cta">
                    Browse plans
                  </LinkButton>
                }
              >
                Book a plan or ask to change one and it shows up here.
              </EmptyState>
            </Card>
          ) : (
            page.items.map((e) => (
              <Card key={e.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-start gap-3">
                  <div className="font-semibold">
                    {LABELS.enquiryType[e.type]}
                    {e.planName ? ` · ${e.planName}` : ''}
                  </div>
                  <EnquiryStatusBadge status={e.status} />
                </div>
                <div className="text-[13px] text-muted">
                  {[e.registrationNumber, dateTime(e.createdAt)].filter(Boolean).join(' · ')}
                </div>
              </Card>
            ))
          )
        }
      </QueryView>
      <ContactButtons className="mt-2" />
    </div>
  );
}
