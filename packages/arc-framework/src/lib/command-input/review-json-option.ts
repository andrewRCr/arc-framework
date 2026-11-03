/** Shared diagnostics for automatic JSON review commands. */
import type { Command } from "commander";
import { formatCommandPath } from "./command-path.js";
/** Reject a redundant output flag on JSON request commands. */
export function rejectUnsupportedReviewJson(_command: Command, actionCommand: Command): void {
  if (actionCommand.opts().json !== true) return;
  actionCommand.error(
    `error: option '--json' is unsupported for ${formatCommandPath(actionCommand)}; `
      + "pass a JSON request file or '-' for stdin. JSON output is automatic.",
    { exitCode: 1, code: "arc.review.unsupportedJsonOption" },
  );
}

/** Reject a redundant output flag on automatic JSON commands. */
export function rejectUnsupportedReviewOutputJson(this: Command): void {
  const commandPath = formatCommandPath(this);
  this.error(
    `error: option '--json' is unsupported for ${commandPath}; JSON output is automatic. `
      + `See '${commandPath} --help' for accepted inputs.`,
    { exitCode: 1, code: "arc.review.unsupportedJsonOption" },
  );
}
