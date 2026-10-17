import { z } from "zod";
const searchText = z
  .string()
  .trim()
  .max(80)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
export const directoryQuery = z
  .object({
    q: searchText.optional(),
    governorate: searchText.optional(),
    city: searchText.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    cursor: z.string().uuid().optional(),
  })
  .strict();
