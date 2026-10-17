import { z } from "zod";
export const id = z
  .string()
  .uuid()
  .transform((v) => v.toLowerCase());
export const transferSchema = z
  .object({
    fromBranchId: id,
    toBranchId: id,
    points: z.number().int().positive().max(2147483647),
  })
  .strict()
  .refine((v) => v.fromBranchId !== v.toBranchId);
export const pageSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: id.optional(),
  })
  .strict();
