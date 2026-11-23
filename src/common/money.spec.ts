import { Prisma } from '@prisma/client';
import { ratingAverage, splitPayment } from './money';

describe('splitPayment (90% freelancer / 10% platform)', () => {
  it('splits the milestone from the brief: $100 -> $90 + $10', () => {
    const { payout, commission } = splitPayment(new Prisma.Decimal(100));
    expect(payout.toString()).toBe('90');
    expect(commission.toString()).toBe('10');
  });

  it.each(['0.01', '0.05', '33.33', '199.99', '999999.99'])(
    'never loses a cent for %s',
    (price) => {
      const total = new Prisma.Decimal(price);
      const { payout, commission } = splitPayment(total);
      expect(payout.add(commission).equals(total)).toBe(true);
      expect(commission.decimalPlaces()).toBeLessThanOrEqual(2);
    },
  );

  it('is exact where floats are not (0.1 + 0.2)', () => {
    expect(new Prisma.Decimal('0.1').add('0.2').toString()).toBe('0.3');
  });
});

describe('ratingAverage', () => {
  it('returns null without ratings and one decimal otherwise', () => {
    expect(ratingAverage(0, 0)).toBeNull();
    expect(ratingAverage(14, 3)).toBe(4.7);
  });
});
