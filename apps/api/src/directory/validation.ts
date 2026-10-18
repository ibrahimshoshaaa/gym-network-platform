import { z } from "zod";
const searchText = z
  .string()
  .trim()
  .max(80)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
const coordinate = (min: number, max: number) => z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().min(min).max(max));
export const directoryQuery = z
  .object({
    q: searchText.optional(),
    governorate: searchText.optional(),
    city: searchText.optional(),
    minPrice:z.coerce.number().int().min(1).max(2147483647).optional(),
    maxPrice:z.coerce.number().int().min(1).max(2147483647).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    cursor: z.string().uuid().optional(),
    latitude: coordinate(-90, 90).optional(),
    longitude: coordinate(-180, 180).optional(),
  })
  .strict()
  .refine(q=>q.minPrice===undefined||q.maxPrice===undefined||q.minPrice<=q.maxPrice)
  .refine(q => (q.latitude === undefined) === (q.longitude === undefined), "Both coordinates are required");
