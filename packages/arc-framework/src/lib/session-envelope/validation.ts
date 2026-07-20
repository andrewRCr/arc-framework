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
  return issues.map((issue) => {
    const path = issue.path.length === 0 ? "<root>" : issue.path.map(String).join(".");
    return `${path}: ${issue.message}`;
  }).join("; ");
}
