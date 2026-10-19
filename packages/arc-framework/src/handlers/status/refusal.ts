/** Render actionable status refusals consistently for people and machine consumers. */
import type { StatusViewRefusal } from "../../lib/status/store-view-result.js";
import type { StatusCliOptions } from "./input.js";

/** Print the repair route, preserve the machine refusal when requested, and fail the invocation. */
export function renderStatusViewRefusal(refusal: StatusViewRefusal, opts: Pick<StatusCliOptions, "json">): void {
  process.stderr.write(`Error [${refusal.code}]: ${refusal.condition} ${refusal.remedy.text}\n`);
  if (opts.json) process.stdout.write(`${JSON.stringify({ status: "refused", refusal })}\n`);
  process.exitCode = 1;
}
