/** Render retained runner ownership and provider recovery without creating durable job records. */
import type { RetainedCheckExecution } from "../../lib/checks/runner/execution.js";
import { runnerDisplayText } from "../../lib/checks/display-text.js";

/** Name the retained inputs and required provider settlement before a fresh retry. */
export function retainedRunnerRemedy(retained: RetainedCheckExecution): string {
  const context = retained.contextId === undefined ? "" : `, context ${JSON.stringify(retained.contextId)}`;
  const inputs = retained.environmentFiles.length === 0 ? "" : `; explicit files ${retained.environmentFiles.map(path => JSON.stringify(path)).join(", ")}`;
  return [`Inspect and settle plan ${retained.planId}${context}, adapter ${retained.adapter.map(argument => JSON.stringify(argument)).join(" ")}.`,
    `Retained source ${JSON.stringify(retained.sourceRoot)}; manifest ${JSON.stringify(retained.manifest)}${inputs}.`,
    retained.recovery === undefined ? "Use the provider's attempt inspection procedure before removing retained inputs."
      : runnerDisplayText(retained.recovery),
    "Repair the runner and retry with a fresh attempt."].join(" ");
}
