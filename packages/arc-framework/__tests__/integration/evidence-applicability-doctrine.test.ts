/** Shipped integration doctrine stays aligned with typed evidence-applicability behavior. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");

async function readPair(path: string): Promise<string> {
  const [packaged, project] = await Promise.all([
    readFile(resolve(root, "packages/arc-framework/arc", path), "utf8"),
    readFile(resolve(root, ".arc", path), "utf8"),
  ]);
  expect(project).toBe(packaged);
  return packaged;
}

describe("evidence applicability integration doctrine", () => {
  it("binds applicability to content and terminal authority to typed evidence", async () => {
    const strategy = await readPair("reference/strategies/arc/strategy-integration.md");

    expect(strategy).toMatch(softWrappedProse("Evidence applicability follows the content an earlier result covers"));
    expect(strategy).toContain("assess-evidence-applicability");
    expect(strategy).toMatch(/Disjoint protected-base movement[\s\S]*without a reconcile commit/iu);
    expect(strategy).toMatch(/Overlapping movement[\s\S]*one typed base reconcile[\s\S]*fresh checkpoint/iu);
    expect(strategy).toMatch(/exact Candidate head[\s\S]*named target ref[\s\S]*not a base object ID/iu);
    expect(strategy).toMatch(/Required-check\s+evidence is head-bound[\s\S]*base CI is the backstop/iu);
  });

  it("keeps concurrent sessions independent until their own terminal boundary", async () => {
    const strategy = await readPair("reference/strategies/arc/strategy-concurrent-work.md");

    expect(strategy).toMatch(/do not coordinate around one another's landing windows/iu);
    expect(strategy).toMatch(/disjoint landing[\s\S]*invalidates nothing/iu);
    expect(strategy).toMatch(/Errand branches use the same content rule/iu);
    expect(strategy).toMatch(/Merge queues are host-side options[\s\S]*builds no queue mechanism/iu);
    expect(strategy).not.toMatch(softWrappedProse("Merge from one designated worktree"));
    expect(strategy).not.toMatch(softWrappedProse("Refresh the others after a merge"));
  });

  it("retains exact approval around the bounded reconcile exception", async () => {
    const [rules, workflow] = await Promise.all([
      readPair("system/rules/DEV-RULES.ARC.md"),
      readPair("system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    ]);

    expect(rules).toMatch(
      /typed base reconcile[\s\S]*complete host-admission evidence[\s\S]*arc check new-head --from <pre-merge head>[\s\S]*exact-head authorization/iu,
    );
    expect(workflow).toMatch(/Clearance never carries across the[\s\S]*overlapping base-merge arm/iu);
    expect(workflow).toMatch(/disjoint movement[\s\S]*without a fresh review by[\s\S]*default/iu);
  });
});
