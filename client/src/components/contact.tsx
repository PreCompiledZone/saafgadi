import { useContact } from '../api/hooks';
import { callLink, whatsappLink } from '../lib/contact';
import { Phone, WhatsApp } from './icons';
import { AnchorButton, cx } from './ui';

/** WhatsApp + Call buttons; each is hidden when its number isn't set. */
export function ContactButtons({
  message,
  onContact,
  primary = 'none',
  className,
  labels = { whatsapp: 'WhatsApp', call: 'Call us' },
}: {
  message?: string;
  onContact?: (via: 'whatsapp' | 'call') => void;
  primary?: 'whatsapp' | 'none';
  className?: string;
  labels?: { whatsapp: string; call: string };
}) {
  const contact = useContact().data;
  const wa = whatsappLink(contact, message);
  const tel = callLink(contact);
  if (!wa && !tel) return null;
  return (
    <div
      className={cx(
        'grid gap-2.5',
        wa && tel && primary === 'none' ? 'grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {wa ? (
        <AnchorButton
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          variant={primary === 'whatsapp' ? 'cta' : 'secondary'}
          size={primary === 'whatsapp' ? 'lg' : 'md'}
          onClick={() => onContact?.('whatsapp')}
        >
          <WhatsApp size={18} className={primary === 'whatsapp' ? '' : 'text-accent-ink'} />
          {labels.whatsapp}
        </AnchorButton>
      ) : null}
      {tel ? (
        <AnchorButton href={tel} onClick={() => onContact?.('call')}>
          <Phone size={18} className="text-accent-ink" />
          {labels.call}
        </AnchorButton>
      ) : null}
    </div>
  );
}
