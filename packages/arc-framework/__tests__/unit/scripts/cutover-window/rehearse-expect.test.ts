/** A rehearsal step passes only when an operation's status and findings match what it expects, one for one. */
import { expect, it } from "vitest";
import { expectWindowRehearsalResult, type WindowRehearsalExpectation } from "../../../../src/scripts/cutover-window/rehearse-expect.js";
import { WindowRehearsalStop } from "../../../../src/scripts/cutover-window/rehearse-run.js";
import type { WindowFinding, WindowResult } from "../../../../src/scripts/cutover-window/result.js";

const finding = (subject: string, condition: string): WindowFinding => ({ subject, condition, remedy: "Repair it, then retry." });
const refused = (...findings: WindowFinding[]): WindowResult => ({ operation: "check", status: "refused", findings });
const dirty = finding("primary", "Dirty checkout: 1 changed path."), moved = finding("local:main", "Changed branch tip at main.");

function stopFor(result: WindowResult, expected: WindowRehearsalExpectation): string {
  try {
    expectWindowRehearsalResult(result, expected);
  } catch (error) {
    expect(error).toBeInstanceOf(WindowRehearsalStop);
    return (error as Error).message;
  }
  throw new Error("The result matched its expectation.");
}

it("passes findings in any order, each matching the expectation whose phrase its condition states", () => {
  expect(expectWindowRehearsalResult(refused(moved, dirty), { status: "refused",
    findings: [{ subject: "primary", condition: "Dirty checkout" }, { subject: "local:main", condition: "Changed branch tip" }] }))
    .toBe("check refused with 2 expected finding(s).");
});

it("matches findings to expectations as a whole rather than first come", () => {
  const both = finding("primary", "Changed HEAD and branch tip."), head = finding("primary", "Changed HEAD.");
  expect(expectWindowRehearsalResult(refused(both, head), { status: "refused",
    findings: [{ subject: "primary", condition: "Changed HEAD" }, { subject: "primary", condition: "branch tip" }] }))
    .toBe("check refused with 2 expected finding(s).");
});

it.each([
  ["an extra finding", refused(dirty, moved), [{ subject: "primary", condition: "Dirty checkout" }],
    "check refused, expected refused.\nUnexpected finding — local:main: Changed branch tip at main."],
  ["a missing finding", refused(dirty), [{ subject: "primary", condition: "Dirty checkout" }, { subject: "local:main", condition: "Changed branch tip" }],
    "check refused, expected refused.\nMissing finding — local:main: …Changed branch tip…"],
  ["a finding under another subject", refused(finding("host:main", "Changed branch tip at main.")), [{ subject: "local:main", condition: "Changed branch tip" }],
    "check refused, expected refused.\nUnexpected finding — host:main: Changed branch tip at main.\nMissing finding — local:main: …Changed branch tip…"],
  ["a condition without the expected phrase", refused(dirty), [{ subject: "primary", condition: "Changed HEAD" }],
    "check refused, expected refused.\nUnexpected finding — primary: Dirty checkout: 1 changed path.\nMissing finding — primary: …Changed HEAD…"],
  ["a duplicated finding", refused(dirty, dirty), [{ subject: "primary", condition: "Dirty checkout" }],
    "check refused, expected refused.\nUnexpected finding — primary: Dirty checkout: 1 changed path."],
  ["a duplicated expectation", refused(dirty), [{ subject: "primary", condition: "Dirty" }, { subject: "primary", condition: "Dirty" }],
    "check refused, expected refused.\nMissing finding — primary: …Dirty…"],
])("stops on %s", (_case, result, findings, stop) => {
  expect(stopFor(result, { status: "refused", findings })).toBe(stop);
});

it("stops on another status even when the findings match", () => {
  expect(stopFor({ operation: "check", status: "findings", findings: [dirty] },
    { status: "refused", findings: [{ subject: "primary", condition: "Dirty checkout" }] })).toBe("check findings, expected refused.");
});
