import type { PrismaClient } from "@prisma/client";
import { loginSchema, registrationSchema } from "./validation.js";
import { DomainError } from "../domain/errors.js";
import { verifyPassword, hashPassword } from "./passwords.js";
import { createSession } from "./sessions.js";
import { publicIdentity } from "./trainees.js";
import { serializable } from "../ledger/service.js";

export async function loginAdmin(db: PrismaClient, input: unknown) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const { identifier, password } = parsed.data;
  const user = await db.user.findUnique({
    where: identifier.includes("@")
      ? { email: identifier }
      : { phoneE164: identifier },
    include: { password: true },
  });
  const hash =
    user?.isActive && user.role === "PLATFORM_ADMIN"
      ? user.password?.passwordHash
      : undefined;
  if (!(await verifyPassword(password, hash)) || !hash || !user)
    throw new DomainError("INVALID_CREDENTIALS");
  return serializable(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({
      where: { id: user.id },
      include: { password: true },
    });
    if (
      !current?.isActive ||
      current.role !== "PLATFORM_ADMIN" ||
      current.password?.passwordHash !== hash
    )
      throw new DomainError("INVALID_CREDENTIALS");
    const expiresAt = new Date(Date.now() + 8 * 3600000);
    const accessToken = await createSession(tx, current.id, expiresAt);
    await tx.auditLog.create({
      data: {
        actorId: current.id,
        action: "ADMIN_LOGIN",
        entityId: current.id,
        reason: "Platform admin password sign-in",
      },
    });
    return {
      user: publicIdentity(current),
      accessToken,
      tokenType: "Bearer",
      expiresAt: expiresAt.toISOString(),
    };
  });
}

// Operator-only bootstrap. No HTTP endpoint invokes this function.
export async function provisionFirstAdmin(db: PrismaClient, input: unknown) {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) throw new DomainError("INVALID_INPUT");
  const data = parsed.data,
    passwordHash = await hashPassword(data.password);
  return serializable(db, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('first-platform-admin', 0))`;
    if (await tx.user.findFirst({ where: { role: "PLATFORM_ADMIN" } }))
      throw new DomainError("ADMIN_ALREADY_EXISTS");
    const user = await tx.user.create({
      data: {
        displayName: data.displayName,
        email: data.email,
        phoneE164: data.phone,
        role: "PLATFORM_ADMIN",
        password: { create: { passwordHash } },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "FIRST_ADMIN_PROVISIONED",
        entityId: user.id,
        reason:
          "Operator provisioned first admin via stdin; no default password or public signup",
      },
    });
    return { id: user.id };
  });
}
