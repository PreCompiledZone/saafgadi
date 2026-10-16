import { useContact } from '../api/hooks';
import { callLink, displayPhone, visitorHelpMessage, whatsappLink } from '../lib/contact';
import { Mail, Phone, WhatsApp } from './icons';
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

/** Footer "Contact" block: WhatsApp, Call and email as small text links. */
export function FooterContact() {
  const contact = useContact().data;
  const wa = whatsappLink(contact, visitorHelpMessage(contact));
  const tel = callLink(contact);
  const email = contact?.supportEmail;
  if (!wa && !tel && !email) return null;
  const link = 'inline-flex items-center gap-1.5 text-muted no-underline hover:text-ink py-1';
  return (
    <section aria-labelledby="footer-contact" className="flex flex-col items-center gap-1">
      <h2 id="footer-contact" className="text-xs font-semibold uppercase tracking-[1.2px]">
        Contact
      </h2>
      <div className="flex flex-wrap justify-center gap-x-4">
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={link}>
            <WhatsApp size={16} />
            {displayPhone(contact!.whatsappNumber)}
          </a>
        ) : null}
        {tel ? (
          <a href={tel} className={link}>
            <Phone size={16} />
            {displayPhone(contact!.callNumber)}
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} className={link}>
            <Mail size={16} />
            {email}
          </a>
        ) : null}
      </div>
    </section>
  );
}
