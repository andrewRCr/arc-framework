/** Machine envelopes distinguish check results from request failures. */
import { expect, it } from "vitest";
import { renderDeclaredChecks } from "../../../../src/handlers/check/run-output.js";
import type { RunDeclaredChecksResult } from "../../../../src/handlers/check/run.js";

const cases: Array<{ name: string; outcome: RunDeclaredChecksResult; expected: object }> = [
  { name: "result", outcome: { kind: "result", exitCode: 0, result: { status: "none declared", checks: [] } },
    expected: { schemaVersion: 1, result: { status: "none declared", checks: [] } } },
  { name: "error", outcome: { kind: "error", exitCode: 2, error: { kind: "invalid", message: "checks.lint.command is invalid" } },
    expected: { schemaVersion: 1, error: { kind: "invalid", message: "checks.lint.command is invalid" } } },
];
it.each(cases)("versions the $name envelope without mixing payloads", ({ outcome, expected }) => {
  expect(JSON.parse(renderDeclaredChecks(outcome, true))).toEqual(expected);
});
