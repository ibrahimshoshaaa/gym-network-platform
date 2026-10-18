import { upstream, failure } from "../../../lib/gateway";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return await upstream("health"); } catch (error) { return failure(error); }
}
