"use client";
import { useRef, useState } from "react";
import { FinancialCommand } from "./financial-command";
export function useCommand() {
  const command = useRef<FinancialCommand | null>(null);
  if (!command.current) command.current = new FinancialCommand();
  const [uncertain, setUncertain] = useState(false);
  async function call<T>(path: string, body: unknown): Promise<T> {
    try {
      return await command.current!.run<T>(path, body);
    } catch (e) {
      if (command.current!.uncertain)
        throw new Error(
          "نتيجة الطلب غير مؤكدة. اضغط التأكيد لإعادة نفس الطلب بأمان، ولا تبدأ طلبًا جديدًا قبل مراجعة السجل.",
        );
      throw e;
    } finally {
      setUncertain(command.current!.uncertain);
    }
  }
  return { call, uncertain };
}
