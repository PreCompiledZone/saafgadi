import { LABELS } from '@shared/enums';
import type { AdminDashboard as Data } from '@shared/types';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi, useApiMutation } from '../../api/hooks';
import { Plus } from '../../components/icons';
import {
  AnchorButton,
  Button,
  Card,
  EmptyState,
  LinkButton,
  PageTitle,
  Progress,
  QueryView,
  Stat,
} from '../../components/ui';
import { whatsappTo } from '../../lib/contact';
import {
  initials,
  longDate,
  money,
  plural,
  relativeDay,
  shortDate,
  shortName,
} from '../../lib/format';
import { Table, Td, Tr } from './parts';

function TodayBar({ w }: { w: Data['washes'] }) {
  const total = w.done + w.notDone + w.toDo;
  return (
    <Card className="px-6 py-5 flex flex-col gap-3.5" aria-label="Today’s washes">
      <div className="flex flex-wrap justify-between gap-2 items-baseline">
        <h2 className="text-[17px] font-semibold">Today’s washes</h2>
        <span className="text-sm text-muted">
          <b className="text-ink">{w.done}</b> done · <b className="text-ink">{w.notDone}</b> not
          done · <b className="text-ink">{w.toDo}</b> to do, of {w.due} due
        </span>
      </div>
      {total > 0 ? (
        <div
          className="flex gap-[3px] h-3"
          role="img"
          aria-label={`${w.done} done, ${w.notDone} not done, ${w.toDo} to do`}
        >
          {w.done ? (
            <div className="rounded-l-md rounded-r-sm bg-accent" style={{ flex: w.done }} />
          ) : null}
          {w.notDone ? <div className="rounded-sm bg-amber" style={{ flex: w.notDone }} /> : null}
          {w.toDo ? (
            <div className="rounded-r-md rounded-l-sm bg-track" style={{ flex: w.toDo }} />
          ) : null}
        </div>
      ) : (
        <div className="h-3 rounded-md bg-track" />
      )}
    </Card>
  );
}

export function AdminDashboard() {
  const q = useApi<Data>(['admin', 'dashboard'], '/admin/dashboard', { refetchInterval: 60_000 });
  const contacted = useApiMutation(
    (id: number) => api.put(`/admin/enquiries/${id}`, { status: 'CONTACTED' }),
    [['admin']],
  );
  return (
    <QueryView query={q}>
      {(d) => (
        <>
          <PageTitle
            eyebrow={longDate(d.today)}
            title="Dashboard"
            actions={
              <>
                <LinkButton to="/admin/payments?record=1" className="h-[46px] rounded-xl">
                  Record payment
                </LinkButton>
                <LinkButton
                  to="/admin/subscriptions/activate"
                  variant="cta"
                  className="h-[46px] rounded-xl"
                >
                  <Plus size={18} /> Activate plan
                </LinkButton>
              </>
            }
          />
          <TodayBar w={d.washes} />
          <section aria-label="Key numbers" className="grid gap-3.5 grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Active subscriptions"
              value={d.active.total}
              sub={`${plural(d.active.cars, 'car')} · ${plural(d.active.bikes, 'bike')}`}
            />
            <Stat
              label="Expiring in 7 days"
              value={d.expiringSoon.count}
              sub={
                <Link
                  to="/admin/subscriptions?filter=expiring"
                  className="font-semibold no-underline"
                >
                  {d.expired.count ? `${d.expired.count} expired, not renewed` : 'See all'}
                </Link>
              }
            />
            <Stat
              label="Unpaid activations"
              value={d.unpaid.count}
              tone={d.unpaid.count ? 'danger' : undefined}
              sub={
                <Link to="/admin/subscriptions?filter=unpaid" className="no-underline">
                  Activated without payment
                </Link>
              }
            />
            <Stat
              label="Collected this month"
              value={money(d.paymentsThisMonth.total)}
              sub={plural(d.paymentsThisMonth.count, 'payment')}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="px-0 py-2 min-w-0">
              <div className="flex justify-between items-center px-5 py-3">
                <h2 className="text-[17px] font-semibold">Expiring soon</h2>
                <Link
                  to="/admin/subscriptions?filter=expiring"
                  className="text-sm font-semibold no-underline"
                >
                  All subscriptions
                </Link>
              </div>
              {d.expiringSoon.items.length ? (
                <div className="px-[18px]">
                  <Table head={['Vehicle', 'Customer', 'Plan', 'Ends', '']} minWidth={480}>
                    {d.expiringSoon.items.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-bold plate whitespace-nowrap">
                          {s.registrationNumber}
                        </Td>
                        <Td>{shortName(s.userName)}</Td>
                        <Td>
                          {s.vehicleType === 'BIKE'
                            ? 'Bike'
                            : `Car · ${LABELS.vehicleType[s.vehicleType]}`}
                        </Td>
                        <Td>
                          <span className={s.daysLeft <= 2 ? 'font-semibold text-danger' : ''}>
                            {relativeDay(s.endDate, d.today)}
                          </span>
                        </Td>
                        <Td>
                          <a
                            href={whatsappTo(
                              s.userMobile,
                              `Hi ${s.userName.split(' ')[0]}, your ${s.planName} for ${s.registrationNumber} ends on ${shortDate(s.endDate)}. Reply to renew!`,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold no-underline whitespace-nowrap"
                          >
                            Remind
                          </a>
                        </Td>
                      </Tr>
                    ))}
                  </Table>
                </div>
              ) : (
                <EmptyState title="Nothing expiring this week" />
              )}
            </Card>

            <Card className="pt-2 flex flex-col gap-1.5 min-w-0">
              <div className="flex justify-between items-center py-3">
                <h2 className="text-[17px] font-semibold">Washers today</h2>
                <Link to="/admin/wash-logs" className="text-sm font-semibold no-underline">
                  Wash logs
                </Link>
              </div>
              {d.washers.length ? (
                d.washers.map((w) => (
                  <div key={w.id} className="flex flex-col gap-1.5 py-1.5">
                    <div className="flex justify-between text-sm gap-2">
                      <span className="font-semibold">{w.name}</span>
                      <span className="text-muted">
                        {w.done} of {w.due}
                        {w.behind ? (
                          <span className="text-danger font-semibold">
                            {' '}
                            · {w.behind} behind schedule
                          </span>
                        ) : null}
                      </span>
                    </div>
                    <Progress
                      value={w.done}
                      max={w.due}
                      label={`${w.name}: ${w.done} of ${w.due}`}
                      height={8}
                    />
                  </div>
                ))
              ) : (
                <EmptyState
                  title="No washers yet"
                  action={
                    <LinkButton to="/admin/washers" size="sm">
                      Add a washer
                    </LinkButton>
                  }
                />
              )}
            </Card>
          </div>

          {d.societies.length ? (
            <Card className="pt-2">
              <div className="flex justify-between items-center py-3">
                <h2 className="text-[17px] font-semibold">Societies today</h2>
                <Link to="/admin/societies" className="text-sm font-semibold no-underline">
                  All societies
                </Link>
              </div>
              <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
                {d.societies.map((s) => (
                  <div key={s.societyId ?? 'none'} className="flex flex-col gap-1.5 py-1.5">
                    <div className="flex justify-between text-sm gap-2">
                      {s.societyId ? (
                        <Link
                          to={`/admin/societies/${s.societyId}`}
                          className="font-semibold no-underline text-ink"
                        >
                          {s.name}
                        </Link>
                      ) : (
                        <Link
                          to="/admin/societies"
                          className="font-semibold no-underline text-muted"
                        >
                          {s.name}
                        </Link>
                      )}
                      <span className="text-muted">
                        {s.done} of {s.due}
                        {s.notDone ? ` · ${s.notDone} not done` : ''}
                        {s.behind ? (
                          <span className="text-danger font-semibold"> · {s.behind} behind</span>
                        ) : null}
                      </span>
                    </div>
                    <Progress
                      value={s.done}
                      max={s.due}
                      label={`${s.name}: ${s.done} of ${s.due}`}
                      height={8}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card className="pt-2 pb-3 flex flex-col">
            <div className="flex justify-between items-center py-3">
              <h2 className="text-[17px] font-semibold">
                Open enquiries{' '}
                {d.openEnquiries.count ? (
                  <span className="text-muted font-sans text-sm">({d.openEnquiries.count})</span>
                ) : null}
              </h2>
              <Link to="/admin/enquiries" className="text-sm font-semibold no-underline">
                All enquiries
              </Link>
            </div>
            {d.openEnquiries.items.length ? (
              d.openEnquiries.items.map((e) => (
                <div key={e.id} className="flex flex-wrap gap-3 items-center py-3 dotted-top">
                  <span className="w-10 h-10 shrink-0 rounded-full bg-accent-soft text-accent-deep font-bold flex items-center justify-center">
                    {initials(e.userName ?? '?')}
                  </span>
                  <div className="flex-[1_1_240px] min-w-0">
                    <div className="font-semibold">
                      {shortName(e.userName ?? 'Guest')}{' '}
                      {e.type === 'CHANGE_PLAN'
                        ? 'asked to change plan'
                        : e.planName
                          ? `wants ${e.planName}`
                          : 'has a question'}
                      {e.vehicleLabel ? ` · ${e.vehicleLabel.split(' · ')[1]}` : ''}
                    </div>
                    <div className="text-[13px] text-muted">
                      {[
                        LABELS.enquiryType[e.type],
                        e.registrationNumber,
                        new Date(e.createdAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {e.userMobile ? (
                      <AnchorButton
                        href={whatsappTo(e.userMobile)}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                      >
                        WhatsApp
                      </AnchorButton>
                    ) : null}
                    {e.type === 'NEW_PLAN' && e.userId && e.vehicleId ? (
                      <LinkButton
                        to={`/admin/subscriptions/activate?userId=${e.userId}&vehicleId=${e.vehicleId}${e.planId ? `&planId=${e.planId}` : ''}&enquiryId=${e.id}`}
                        variant="cta"
                        size="sm"
                      >
                        Activate
                      </LinkButton>
                    ) : (
                      <Button
                        size="sm"
                        loading={contacted.isPending && contacted.variables === e.id}
                        onClick={() => contacted.mutate(e.id)}
                      >
                        Mark contacted
                      </Button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="No open enquiries" />
            )}
          </Card>
        </>
      )}
    </QueryView>
  );
}
