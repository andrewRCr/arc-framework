/** Exact native observations retain their meaning before aggregate evidence reduction. */
import { expect, it } from "vitest";
import { normalizeCheckInvocationOutcome, reduceCheckInvocationOutcomes, type CheckInvocationObservation } from "../../../../src/lib/checks/result.js";

it.each([
  { name: "zero", observation: { status: "completed", exitCode: 0 }, expected: { kind: "success", exitCode: 0 } },
  { name: "failure 256", observation: { status: "completed", exitCode: 256 }, expected: { kind: "failure", exitCode: 256 } },
  { name: "high-bit failure", observation: { status: "completed", exitCode: 0xC0000005 }, expected: { kind: "failure", exitCode: 0xC0000005 } },
  { name: "maximum DWORD", observation: { status: "completed", exitCode: 0xFFFFFFFF }, expected: { kind: "failure", exitCode: 0xFFFFFFFF } },
  { name: "declared no evidence", observation: { status: "completed", exitCode: 5 }, noEvidence: 5, expected: { kind: "no-evidence", exitCode: 5 } },
  { name: "declared 137", observation: { status: "completed", exitCode: 137 }, noEvidence: 137, expected: { kind: "no-evidence", exitCode: 137 } },
  { name: "killed", observation: { status: "completed", exitCode: 137 },
    expected: { kind: "unavailable", exitCode: 137, reason: expect.stringContaining("killed before it finished") } },
  { name: "explicit not run", observation: { status: "completed", exitCode: 5, notRunReason: "not started", notice: "not run: not started" }, noEvidence: 5,
    expected: { kind: "unavailable", exitCode: 5, reason: "not started", notice: "not run: not started" } },
  { name: "missing", observation: undefined, expected: { kind: "unavailable", reason: expect.stringContaining("no terminal outcome") } },
  { name: "unavailable", observation: { status: "unavailable", reason: "worker unavailable" }, expected: { kind: "unavailable", reason: "worker unavailable" } },
  { name: "cancelled", observation: { status: "cancelled", reason: "cancelled before launch" }, expected: { kind: "unavailable", reason: "cancelled before launch" } },
] satisfies Array<{ name: string; observation: CheckInvocationObservation | undefined; noEvidence?: number; expected: unknown }>)(
  "normalizes $name without truncation or loss of native precedence", ({ observation, noEvidence, expected }) => {
    expect(normalizeCheckInvocationOutcome(observation, noEvidence)).toEqual(expected);
  },
);

const completed = (exitCode: number, notice?: string): CheckInvocationObservation => ({ status: "completed", exitCode,
  ...(notice === undefined ? {} : { notice }) });
const unavailable: CheckInvocationObservation = { status: "unavailable", reason: "worker unavailable" };

it.each([
  { name: "failure beside missing work", input: [completed(7), undefined], expected: { kind: "failure", exitCode: 7, incomplete: [expect.stringContaining("no terminal outcome")] } },
  { name: "failure after unavailability", input: [unavailable, completed(7)], expected: { kind: "failure", exitCode: 7, incomplete: ["worker unavailable"] } },
  { name: "exact high-bit failure", input: [completed(0xFFFFFFFF), unavailable], expected: { kind: "failure", exitCode: 0xFFFFFFFF, incomplete: ["worker unavailable"] } },
  { name: "success beside missing work", input: [completed(0), undefined], expected: { kind: "unavailable", incomplete: [expect.stringContaining("no terminal outcome")] } },
  { name: "no evidence beside missing work", input: [completed(5), undefined], noEvidence: 5, expected: { kind: "unavailable" } },
  { name: "kill before failure", input: [completed(137), completed(7)], expected: { kind: "failure", exitCode: 7, incomplete: [expect.stringContaining("killed")] } },
  { name: "kill after failure", input: [completed(7), completed(137)], expected: { kind: "failure", exitCode: 7, incomplete: [expect.stringContaining("killed")] } },
  { name: "last completed failure", input: [completed(7), completed(8)], expected: { kind: "failure", exitCode: 8, incomplete: [] } },
  { name: "mixed evidence and no evidence", input: [completed(5), completed(0), completed(5)], noEvidence: 5, expected: { kind: "success", exitCode: 0, incomplete: [] } },
  { name: "only no evidence", input: [completed(5), completed(5)], noEvidence: 5, expected: { kind: "no-evidence", exitCode: 5, incomplete: [] } },
  { name: "declared no-evidence kill", input: [completed(137)], noEvidence: 137, expected: { kind: "no-evidence", exitCode: 137, incomplete: [] } },
  { name: "valid empty share", input: [], expected: { kind: "success", exitCode: 0, incomplete: [] } },
  { name: "empty no-evidence declaration", input: [], noEvidence: 5, expected: { kind: "no-evidence", exitCode: 5, incomplete: [] } },
  { name: "complete success", input: [completed(0), completed(0)], expected: { kind: "success", exitCode: 0, incomplete: [] } },
  { name: "missing required output", input: [completed(0)], incomplete: ["output incomplete"], expected: { kind: "unavailable", incomplete: ["output incomplete"] } },
  { name: "failure beside bad closure", input: [completed(7)], incomplete: ["closure incomplete"], expected: { kind: "failure", exitCode: 7, incomplete: ["closure incomplete"] } },
  { name: "ordered unique notices", input: [completed(0, "first"), completed(0, "second"), completed(0, "first")], expected: { kind: "success", notices: ["first", "second"] } },
] satisfies Array<{ name: string; input: Array<CheckInvocationObservation | undefined>; noEvidence?: number; incomplete?: string[]; expected: unknown }>)(
  "reduces $name without allowing incomplete success", ({ input, noEvidence, incomplete, expected }) => {
    expect(reduceCheckInvocationOutcomes(input.map(outcome => normalizeCheckInvocationOutcome(outcome, noEvidence)), noEvidence, incomplete))
      .toMatchObject(expected);
  },
);
