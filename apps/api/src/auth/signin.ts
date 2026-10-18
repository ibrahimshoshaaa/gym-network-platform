import type { PrismaClient } from "@prisma/client";
import { loginSchema } from "./validation.js";
import { DomainError } from "../domain/errors.js";
import { consumeAuthLimit } from "./throttle.js";
import { loginAdmin } from "./admin.js";
import { loginStaff } from "./staff.js";
import { loginTrainee } from "./trainees.js";

// Role is chosen exclusively from stored identity. Existing verifiers still
// check activity, assignments and password/session races under their locks.
export async function signIn(db: PrismaClient, input: unknown, ip: string) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const data = parsed.data;
  await consumeAuthLimit(db, "login-identity", data.identifier, 10, 900);
  const user = await db.user.findUnique({
    where: data.identifier.includes("@") ? { email: data.identifier } : { phoneE164: data.identifier },
    select: { role: true },
  });
  if (user?.role === "PLATFORM_ADMIN") {
    await consumeAuthLimit(db, "admin-login-ip", ip, 20, 900);
    await consumeAuthLimit(db, "admin-login-identity", data.identifier, 5, 900);
    return loginAdmin(db, data);
  }
  if (user && ["GYM_OWNER", "BRANCH_MANAGER", "CASHIER"].includes(user.role)) return loginStaff(db, data);
  // The trainee verifier also performs the dummy KDF for an unknown identity.
  return loginTrainee(db, data);
}
