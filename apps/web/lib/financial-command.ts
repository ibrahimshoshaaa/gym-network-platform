import { api, ApiError } from "./client";
// Kept only in memory. A lost response must retry the exact command/key.
export class FinancialCommand {
  uncertain = false;
  private pending: { path: string; body: string; key: string } | null = null;
  constructor(
    private transport: (
      path: string,
      init: RequestInit,
    ) => Promise<unknown> = api,
  ) {}
  async run<T>(path: string, body: unknown): Promise<T> {
    if (!this.pending || !this.uncertain)
      this.pending = {
        path,
        body: JSON.stringify(body),
        key: crypto.randomUUID(),
      };
    const command = this.pending;
    try {
      const result = await this.transport(command.path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": command.key,
        },
        body: command.body,
      });
      this.pending = null;
      this.uncertain = false;
      return result as T;
    } catch (e) {
      this.uncertain = e instanceof ApiError && e.status >= 500;
      if (!this.uncertain) this.pending = null;
      throw e;
    }
  }
}
