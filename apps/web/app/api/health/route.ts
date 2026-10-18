import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  let stage = "load";
  try {
    if (process.env.GYM_EMBEDDED_API !== "true") {
      return NextResponse.json({ status: "unavailable", check: "configuration" }, { status: 503 });
    }
    const { internalRequest } = await import("@gym/api");
    stage = "invoke";
    return await internalRequest("health", { headers: {} });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    const message = error instanceof Error ? error.message : "";
    const check = ["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"].includes(code) ? "module"
      : code === "ERR_UNKNOWN_FILE_EXTENSION" ? "compilation"
      : code === "ERR_DLOPEN_FAILED" ? "native_dependency"
      : message.includes("DATABASE_URL is required") ? "database_configuration"
      : name === "PrismaClientInitializationError" ? "database_client"
      : "runtime";
    // Only categorical diagnostics. Never log connection strings, arguments or bodies.
    console.error("API readiness failed", { stage, name, code, check });
    return NextResponse.json({ status: "unavailable", check, stage }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
