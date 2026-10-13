/** Contract proof that one complete-set disposition approval is a review-fix round's structured gate. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");

function shipped(relativePath: string): string {
  const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
  const installed = readFileSync(join(PROJECT_ROOT, ".arc", relativePath), "utf8");
  expect(installed).toBe(packaged);
  return packaged;
}

function occurrences(document: string, phrase: string): number {
  return [...document.matchAll(new RegExp(softWrappedProse(phrase).source, "gmu"))].length;
}

describe("review-fix round release", () => {
  it("makes the complete-set disposition approval a finding-driven fix's structured gate", () => {
    const rules = shipped("system/rules/DEV-RULES.ARC.md");

    expect(rules).toMatch(softWrappedProse("For a finding-driven fix, the complete-set disposition approval is that gate"));
    expect(rules).toMatch(softWrappedProse("under `arc.pushInterlock: on-workflow`, pushing them and performing the approved hosted settlement"));
    expect(rules).toMatch(softWrappedProse("so a `manual` setting keeps its own stop"));
    expect(rules).toMatch(softWrappedProse("The round returns to the approver when the performed fix exceeds the approved scope"));
    expect(rules).not.toMatch(softWrappedProse("An implementation or finding-driven fix still requires"));
  });

  it("names what approval releases and reports the round as information", () => {
    const triage = shipped("system/methods/review-triage.md");
    const response = shipped("system/methods/review-response.md");

    expect(triage).toMatch(softWrappedProse("Approve: 3 fixes → verify → commit → push → settle 2 threads → standard pass 2?"));
    expect(triage).toMatch(softWrappedProse("as information, not a gate"));
    expect(triage).toMatch(softWrappedProse(
      "Disposition approval and next-pass authorization stay distinct decisions, though one prompt may ask both",
    ));
    expect(triage).not.toMatch(softWrappedProse("Keep disposition approval separate from next-pass authorization."));
    expect(response).toMatch(softWrappedProse("whose commit the complete-set approval releases where `arc.commitInterlock` allows"));
    expect(response).not.toMatch(softWrappedProse("return control to the caller's commit interlock"));
  });

  it("states the release at every caller that triages review findings", () => {
    const callers: ReadonlyArray<readonly [string, number]> = [
      ["system/workflows/arc/supplemental/run-errand.md", 2],
      ["system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md", 2],
      ["system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md", 1],
      ["system/workflows/arc/supplemental/deliver-stack.md", 1],
      ["system/methods/self-review.md", 1],
    ];

    for (const [path, arms] of callers) {
      const caller = shipped(path);
      expect(occurrences(caller, "the fix round's structured gate"), path).toBeGreaterThanOrEqual(arms);
      expect(caller, path).toContain("[review-increment-invariant]: ");
    }
  });

  it("records disposition-approval release beside the other interlock releases", () => {
    const operations = shipped("reference/strategies/arc/strategy-session-operations.md");
    const start = operations.indexOf("### Disposition-Approval Release");
    const end = operations.indexOf("### Push-Timing Reasoning", start);

    expect(start).toBeGreaterThan(operations.indexOf("### Deferred-Review × Commit-Interlock Release"));
    expect(end).toBeGreaterThan(start);
    const section = operations.slice(start, end);
    expect(section).toMatch(softWrappedProse("releases the commit-interlock for the approved fixes"));
    expect(section).toMatch(softWrappedProse("Merge stays behind the integration-interlock."));
  });
});
