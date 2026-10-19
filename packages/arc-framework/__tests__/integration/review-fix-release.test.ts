/** Contract proof that one complete-set disposition approval is a review-fix round's structured gate. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { codeReviewSection } from "../helpers/code-review-section.js";
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

    expect(triage).toMatch(softWrappedProse("Approve: 3 fixes → verify → commit → push → settle 2 threads → local fix check, round 1 since pass 1?"));
    expect(triage).toMatch(softWrappedProse("as information, not a gate"));
    expect(triage).toMatch(softWrappedProse(
      "Disposition approval and each next activity's authorization remain distinct, even when one prompt asks both",
    ));
    expect(triage).not.toMatch(softWrappedProse("Keep disposition approval separate from next-pass authorization."));
    expect(response).toMatch(softWrappedProse("whose commit the complete-set approval releases where `arc.commitInterlock` allows"));
    expect(response).not.toMatch(softWrappedProse("return control to the caller's commit interlock"));
  });

  it("reaches one shared release from every producer-backed findings arm", () => {
    const method = shipped("system/methods/code-review.md");
    for (const [path, arms] of [
      ["system/workflows/arc/supplemental/run-errand.md", 2],
      ["system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md", 2],
      ["system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md", 1],
      ["system/workflows/arc/supplemental/deliver-stack.md", 1],
    ] as const) {
      const caller = shipped(path);
      const body = caller.slice(0, caller.lastIndexOf("\n---\n"));
      expect(occurrences(body, "[code-findings-round]"), path).toBeGreaterThanOrEqual(arms);
      const round = codeReviewSection(caller, "findings-round", method);
      expect(occurrences(round, "the fix round's structured gate")).toBe(1);
      expect(method).toContain("[review-increment-invariant]: ");
      expect(caller).not.toContain("the fix round's structured gate");
    }
    const author = shipped("system/methods/code-review-author.md");
    expect(author).toContain("code-review.md#author-check");
    expect(author).not.toContain("structured gate");
  });

  it("owns each author and producer fix release once while callers retain lifecycle commits", () => {
    const commit = "`commit-interlock` release — commit the approved fixes as `taskCommit`:";
    const method = shipped("system/methods/code-review.md");
    const prepare = shipped("system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md");
    const authoring = shipped("reference/strategies/arc/strategy-workflow-authoring.md");
    const rules = shipped("system/rules/DEV-RULES.ARC.md");
    expect(occurrences(method, commit)).toBe(2);
    expect(occurrences(method, "`push-interlock` release — `workflowPush`:")).toBe(1);
    for (const path of [
      "system/workflows/arc/supplemental/run-errand.md",
      "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      "system/methods/code-review-author.md",
    ]) expect(occurrences(shipped(path), commit), path).toBe(0);
    expect(prepare).toMatch(softWrappedProse("Commit its staged Candidate response as `taskCommit`"));
    expect(authoring).toMatch(softWrappedProse("and review-fix commits a complete-set disposition approval releases"));
    expect(authoring).toMatch(softWrappedProse("and review-fix pushes"));
    expect(rules).toMatch(softWrappedProse(
      "A review-fix round's complete-set disposition approval releases its `taskCommit` and `workflowPush` sites.",
    ));
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
