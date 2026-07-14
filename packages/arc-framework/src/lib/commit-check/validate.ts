/** Canonical commit-message validation entry point. */

import { prepareCommitCheckContext } from "./context.js";
import { parseCommitMessage } from "./parser.js";
import { validateFooter, validateSubjectAndBody } from "./policy.js";
import type { CommitCheckContext, CommitCheckOutcome } from "./types.js";

/**
 * Validate one decoded commit message against shared policy and repository facts.
 *
 * @param message - Decoded message text
 * @param context - Normalized shared validation context
 * @returns Typed skipped or three-valued validation outcome
 */
export async function validateCommitMessage(
  message: string,
  context: CommitCheckContext,
): Promise<CommitCheckOutcome> {
  const prepared = prepareCommitCheckContext(context);
  if (prepared.kind === "outcome") return prepared.outcome;

  const parsed = parseCommitMessage(message);
  const findings = [
    ...validateSubjectAndBody(parsed, prepared.policy),
    ...(await validateFooter(parsed, prepared.policy, prepared.repository)),
  ];
  const errors = findings.filter(({ severity }) => severity === "error").length;
  const warnings = findings.length - errors;
  return {
    kind: "validated",
    verdict: errors > 0 ? "fail" : warnings > 0 ? "pass-with-warnings" : "pass",
    findings,
  };
}
