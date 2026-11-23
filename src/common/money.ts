import { Prisma } from '@prisma/client';

/**
 * Money is never a JavaScript float (0.1 + 0.2 = 0.30000000000000004).
 * In the DB it is NUMERIC(14,2); in code it is Prisma.Decimal.
 */
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export const COMMISSION_RATE = D('0.10');

/**
 * 90% freelancer / 10% platform. The commission is rounded to the cent and the
 * freelancer gets the rest, so payout + commission === amount, always.
 */
export function splitPayment(amount: Prisma.Decimal) {
  const commission = amount
    .mul(COMMISSION_RATE)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { commission, payout: amount.sub(commission) };
}

/** Average rating with one decimal, or null when there are no ratings yet. */
export function ratingAverage(sum: number, count: number) {
  return count === 0 ? null : Math.round((sum / count) * 10) / 10;
}
