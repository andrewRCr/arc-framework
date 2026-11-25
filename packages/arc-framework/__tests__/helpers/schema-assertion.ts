/** Diagnostic assertions for schemas used in tests. */

import type { z } from "zod";

function issuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? "(root)" : path.map(String).join(".");
}

/**
 * Assert a value is accepted and return the parsed output.
 * @param schema - Schema under test.
 * @param value - Candidate input.
 * @returns The schema's parsed output.
 */
export function assertSchemaAccepts<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issuePath(issue.path)}: ${issue.message}`);
    throw new Error(`Expected schema acceptance; issues:\n${issues.join("\n")}`);
  }
  return result.data;
}

/**
 * Assert a value is refused, optionally at a specific issue path.
 * @param schema - Schema under test.
 * @param value - Candidate input.
 * @param expectedPath - Issue path that must appear in the refusal.
 * @returns Nothing when the schema refuses as expected.
 */
export function assertSchemaRefuses<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
  expectedPath?: readonly (string | number)[],
): void {
  const result = schema.safeParse(value);
  if (result.success) {
    throw new Error(`Expected schema refusal; parsed output: ${JSON.stringify(result.data)}`);
  }
  if (expectedPath && !result.error.issues.some((issue) =>
    issue.path.length === expectedPath.length &&
    issue.path.every((segment, index) => segment === expectedPath[index]))) {
    throw new Error(`Expected issue at ${issuePath(expectedPath)}; found: ${
      result.error.issues.map((issue) => issuePath(issue.path)).join(", ")}`);
  }
}
