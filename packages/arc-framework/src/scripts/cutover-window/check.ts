/** Quiescence admission for an explicitly named importing checkout. */
import type { WindowRequest } from "./main.js";
import type { WindowResult } from "./result.js";
import { readWindowPreconditions } from "./preflight.js";
/** Check the pre-existing state before the window writes any hold refs. */
export async function checkWindow(request: WindowRequest): Promise<WindowResult> {
  const findings = await readWindowPreconditions(request.repo);
  return { operation: "check", status: findings.length === 0 ? "passed" : "refused", findings };
}
