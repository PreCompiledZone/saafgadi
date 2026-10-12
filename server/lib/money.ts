/** DECIMAL columns come back as strings. */
export const toNumber = (v: string | number | null | undefined): number =>
  v == null ? 0 : Number(v);

export const toDecimal = (v: number): string => (Math.round(v * 100) / 100).toFixed(2);
