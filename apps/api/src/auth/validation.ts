import { z } from 'zod';

function asciiDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => {
    const n = digit.charCodeAt(0);
    return String(n >= 0x6f0 ? n - 0x6f0 : n - 0x660);
  });
}

export function normalizePhone(value: string) {
  let phone = asciiDigits(value.trim()).replace(/[\s()-]/g, '');
  if (/^01[0125]\d{8}$/.test(phone)) phone = `+20${phone.slice(1)}`;
  if (/^0020/.test(phone)) phone = `+${phone.slice(2)}`;
  return phone;
}
export const emailSchema = z.string().trim().toLowerCase().max(254).email();
export const phoneSchema = z.string().max(40).transform(normalizePhone)
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/))
  .refine(phone => !phone.startsWith('+20') || /^\+201[0125]\d{8}$/.test(phone));
// Passwords are preserved exactly, including Unicode and spaces.
export const newPasswordSchema = z.string().max(256).refine(value => {
  const count = Array.from(value).length;
  return count >= 15 && count <= 128;
});
export const registrationSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  email: emailSchema,
  password: newPasswordSchema,
}).strict();
export const loginSchema = z.object({
  identifier: z.string().trim().max(254).transform(value => value.includes('@') ? value.toLowerCase() : normalizePhone(value))
    .refine(value => emailSchema.safeParse(value).success || phoneSchema.safeParse(value).success),
  password: z.string().min(1).max(256),
}).strict();
export const passwordChangeSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: newPasswordSchema }).strict();
