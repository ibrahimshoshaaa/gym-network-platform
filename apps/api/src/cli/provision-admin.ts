import { PrismaClient } from "@prisma/client";
import { provisionFirstAdmin } from "../auth/admin.js";
const db = new PrismaClient();
try {
  if (process.stdin.isTTY)
    throw new Error(
      "Provide a JSON object on stdin from a protected input source.",
    );
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 8192) throw new Error("Input too large");
  }
  await provisionFirstAdmin(db, JSON.parse(input));
  process.stdout.write(
    "Platform admin created. Sign in through the dashboard.\n",
  );
} catch {
  // Never print Prisma arguments, passwords, stdin or database credentials.
  process.stderr.write(
    "Admin provisioning failed. Check input and database state; an existing admin cannot be replaced by this command.\n",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
