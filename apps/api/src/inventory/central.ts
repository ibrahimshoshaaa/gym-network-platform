import type { Prisma } from '@prisma/client';

// A gym reserve is distinct from every branch's allocated inventory.
export function centralStock(tx: Prisma.TransactionClient, gymId: string) {
  return tx.pointAccount.upsert({
    where: { type_gymId: { type: 'GYM_INVENTORY', gymId } },
    create: { type: 'GYM_INVENTORY', gymId }, update: {},
  });
}
