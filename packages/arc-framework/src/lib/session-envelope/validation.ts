/** Shared validate-for-effect boundary for session-envelope producers. */

import { z } from "zod";

import { ArcError } from "../kernel/index.js";

/**
 * Validate an internal producer value without substituting the parsed copy.
 *
 * @param contractId - Stable registry identity for the complete wire contract
 * @param schema - Complete runtime authority
 * @param value - Internal producer value crossing an output boundary
 * @throws ArcError with normalized issue paths when the producer is defective
 */
export function assertSessionEnvelopeContract<Output>(
  contractId: string,
  schema: z.ZodType<Output>,
  value: unknown,
): asserts value is Output {
  const result = schema.safeParse(value);
  if (result.success) return;
  throw new ArcError(
    `${contractId}: ${formatIssues(result.error.issues)}`,
    "session-envelope.invalid",
  );
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issueMessages(issues).join("; ");
}

function issueMessages(issues: readonly z.core.$ZodIssue[], prefix: readonly PropertyKey[] = []): string[] {
  return issues.flatMap((issue) => {
    const segments = [...prefix, ...issue.path];
    // Some composed authorities already expose the union root and its details.
    // Keep that existing diagnostic order; expand native union issues otherwise.
    if (issue.code === "invalid_union" && issue.errors.length > 0 && !hasDescendantIssue(issues, issue)) {
      return issue.errors.flatMap((branch) => issueMessages(branch, segments));
    }
    const path = segments.length === 0 ? "<root>" : segments.map(String).join(".");
    return [`${path}: ${issue.message}`];
  });
}

function hasDescendantIssue(issues: readonly z.core.$ZodIssue[], parent: z.core.$ZodIssue): boolean {
  return issues.some((issue) => issue !== parent && issue.path.length > parent.path.length
    && parent.path.every((segment, index) => issue.path[index] === segment));
}
