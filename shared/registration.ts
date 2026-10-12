// Indian vehicle registration numbers. Stored normalised (uppercase, no
// spaces or hyphens); displayed with spaces.

const STANDARD = /^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{4})$/;
const BH_SERIES = /^([0-9]{2})(BH)([0-9]{4})([A-Z]{1,2})$/;

/** `mh 14 eh-1234` → `MH14EH1234` */
export function normaliseRegistration(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

export function isValidRegistration(input: string): boolean {
  const n = normaliseRegistration(input);
  return STANDARD.test(n) || BH_SERIES.test(n);
}

/** `MH14EH1234` → `MH 14 EH 1234`, `22BH1234AA` → `22 BH 1234 AA`. Unknown shapes are returned as-is. */
export function formatRegistration(input: string): string {
  const n = normaliseRegistration(input);
  const m = STANDARD.exec(n) ?? BH_SERIES.exec(n);
  if (!m) return n;
  return m
    .slice(1)
    .filter((part) => part !== '')
    .join(' ');
}
