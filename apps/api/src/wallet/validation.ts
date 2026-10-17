import { z } from "zod";
export const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict();
export const movementSchema = pageSchema.extend({
  operation: z
    .enum([
      "TOPUP",
      "SALE",
      "VISIT",
      "VISIT_CANCELLATION",
      "EXPIRY",
      "ADJUSTMENT",
    ])
    .optional(),
});
export function walletView(
  wallet: { balance: number; expiresAt: Date | null },
  now: Date,
) {
  const status =
    wallet.balance === 0
      ? "EMPTY"
      : !wallet.expiresAt
        ? "REVIEW_REQUIRED"
        : wallet.expiresAt <= now
          ? "EXPIRED"
          : "VALID";
  const spendablePoints = status === "VALID" ? wallet.balance : 0;
  return {
    ...wallet,
    status,
    spendablePoints,
    unavailablePoints: wallet.balance - spendablePoints,
    serverTime: now,
  };
}
