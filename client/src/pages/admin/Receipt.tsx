import { LABELS } from '@shared/enums';
import type { ContactInfo, PaymentDto } from '@shared/types';
import type { ReactNode } from 'react';
import { useContact } from '../../api/hooks';
import { WhatsApp } from '../../components/icons';
import { AnchorButton, Sheet } from '../../components/ui';
import { fullDate, money } from '../../lib/format';
import { whatsappTo } from '../../lib/contact';

/** `SG-000123` */
export function receiptNo(p: PaymentDto): string {
  return `SG-${String(p.id).padStart(6, '0')}`;
}

function balance(p: PaymentDto): number | null {
  if (p.subscriptionTotal === null || p.paidToDate === null) return null;
  return Math.max(0, p.subscriptionTotal - p.paidToDate);
}

/** Plain-text receipt for WhatsApp (`*bold*` is WhatsApp markup). */
/** Plan name, or the one-time service. */
function forText(p: PaymentDto): string | null {
  return p.planName ?? (p.serviceName ? `One-time wash · ${p.serviceName}` : null);
}

export function receiptText(p: PaymentDto, contact: ContactInfo | undefined): string {
  const due = balance(p);
  const lines = [
    `*${contact?.businessName || 'SaafGadi'} · Payment receipt*`,
    `Receipt no: ${receiptNo(p)}`,
    `Date: ${fullDate(p.paidOn)}`,
    '',
    `Received from: ${p.userName}`,
    `Amount: *${money(p.amount)}*`,
    `Mode: ${LABELS.paymentMode[p.mode]}${p.reference ? ` (Ref: ${p.reference})` : ''}`,
    p.registrationNumber
      ? `For: ${p.registrationNumber}${forText(p) ? ` · ${forText(p)}` : ''}`
      : 'For: Advance payment',
    p.periodStart && p.periodEnd
      ? `Period: ${fullDate(p.periodStart)} – ${fullDate(p.periodEnd)}`
      : null,
    due === null ? null : due > 0 ? `Balance due: ${money(due)}` : 'Status: Fully paid',
    '',
    'Thank you!',
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 dotted-top text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function ReceiptSheet({
  payment: p,
  onClose,
}: {
  payment: PaymentDto;
  onClose: () => void;
}) {
  const contact = useContact().data;
  const due = balance(p);
  return (
    <Sheet open onClose={onClose} title="Payment receipt">
      <div className="flex flex-col gap-4 pb-2">
        <div className="bg-white rounded-[16px] p-4 shadow-card">
          <div className="flex justify-between items-start gap-3">
            <div>
              <div className="font-display text-lg font-bold">
                {contact?.businessName || 'SaafGadi'}
              </div>
              {contact?.businessAddress ? (
                <div className="text-xs text-muted">{contact.businessAddress}</div>
              ) : null}
            </div>
            <div className="text-right text-xs text-muted">
              <div className="font-semibold text-ink">{receiptNo(p)}</div>
              {fullDate(p.paidOn)}
            </div>
          </div>
          <div className="text-center py-4">
            <div className="text-xs text-muted">Amount received</div>
            <div className="font-display text-[32px] font-bold">{money(p.amount)}</div>
          </div>
          <Line label="Received from">
            {p.userName}
            <div className="text-xs text-muted font-normal">{p.userMobile}</div>
          </Line>
          <Line label="Mode">
            {LABELS.paymentMode[p.mode]}
            {p.reference ? (
              <div className="text-xs text-muted font-normal">{p.reference}</div>
            ) : null}
          </Line>
          <Line label="For">
            {p.registrationNumber ? (
              <>
                <span className="plate font-bold">{p.registrationNumber}</span>
                {forText(p) ? (
                  <div className="text-xs text-muted font-normal">{forText(p)}</div>
                ) : null}
              </>
            ) : (
              'Advance payment'
            )}
          </Line>
          {p.periodStart && p.periodEnd ? (
            <Line label="Period">
              {fullDate(p.periodStart)} – {fullDate(p.periodEnd)}
            </Line>
          ) : null}
          {p.subscriptionTotal !== null && due !== null ? (
            <>
              <Line label="Plan amount">{money(p.subscriptionTotal)}</Line>
              <Line label="Balance due">{due > 0 ? money(due) : 'Fully paid'}</Line>
            </>
          ) : null}
          <Line label="Recorded by">{p.recordedByName}</Line>
        </div>
        <AnchorButton
          href={whatsappTo(p.userMobile, receiptText(p, contact))}
          target="_blank"
          rel="noopener noreferrer"
          variant="cta"
          size="lg"
        >
          <WhatsApp size={20} /> Share on WhatsApp
        </AnchorButton>
      </div>
    </Sheet>
  );
}
