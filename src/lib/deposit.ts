/** Advance PIX deposit: 50% of the booking total (rounded up to the cent) when any chosen service requires it. */
export const DEPOSIT_PERCENT = 50;
export function depositCentsFor(totalCents: number, required: boolean): number {
  if (!required || totalCents <= 0) return 0;
  return Math.ceil((totalCents * DEPOSIT_PERCENT) / 100);
}
