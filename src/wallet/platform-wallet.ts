import { InternalServerErrorException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

/**
 * The platform's 10% commission is credited to the wallet of the admin account
 * (ADMIN_EMAIL), so platform earnings are visible and auditable like any wallet.
 */
export async function platformWallet(tx: Prisma.TransactionClient) {
  const email = (process.env.ADMIN_EMAIL ?? '').toLowerCase();
  const wallet = await tx.wallet.findFirst({
    where: { user: { email, role: Role.ADMIN } },
    select: { id: true },
  });
  if (!wallet) {
    throw new InternalServerErrorException('Platform wallet is not set up');
  }
  return wallet;
}
