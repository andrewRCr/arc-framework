/** Render actionable status refusals consistently for people and machine consumers. */
import type { StatusViewRefusal } from "../../lib/status/store-view-result.js";
import type { StatusCliOptions } from "./input.js";

/** Print the repair route, preserve the machine refusal when requested, and fail the invocation. */
export function renderStatusViewRefusal(refusal: StatusViewRefusal, opts: Pick<StatusCliOptions, "json">, warnings: readonly string[] = []): void {
  if (!opts.json) for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`);
  process.stderr.write(`Error [${refusal.code}]: ${refusal.condition} ${refusal.remedy.text}\n`);
  if (opts.json) process.stdout.write(`${JSON.stringify({ status: "refused", refusal, ...(warnings.length ? { warnings } : {}) })}\n`);
  process.exitCode = 1;
}
