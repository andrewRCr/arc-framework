/** Structural contracts for typed terminal workflow dispatch and bounded residual judgment. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkflowFrontmatter } from "../../src/scripts/audit-method-triggers.js";

const root = resolve(import.meta.dirname, "../../../..");

const workflows = {
  integrate: "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
  deliver: "system/workflows/arc/supplemental/deliver-stack.md",
  errand: "system/workflows/arc/supplemental/run-errand.md",
} as const;

async function readPair(path: string): Promise<string> {
  const [packaged, project] = await Promise.all([
    readFile(resolve(root, "packages/arc-framework/arc", path), "utf8"),
    readFile(resolve(root, ".arc", path), "utf8"),
  ]);
  expect(project).toBe(packaged);
  return packaged;
}

function occurrences(content: string, value: string): number {
  return content.split(value).length - 1;
}

function sectionBetween(content: string, start: string, end: string): string {
  const startIndex = content.indexOf(start);
  if (startIndex === -1) throw new Error(`missing section start: ${start}`);
  const endIndex = content.indexOf(end, startIndex + start.length);
  if (endIndex === -1) throw new Error(`missing section end after "${start}": ${end}`);
  return content.slice(startIndex, endIndex);
}

describe("evidence applicability workflow fire-points", () => {
  it("requires only the typed bounded result that every fire-point actually supplies", async () => {
    const method = await readPair("system/methods/assess-evidence-applicability.md");

    expect(method).toContain("Receive the supplied typed applicability result or projection");
    expect(method).not.toContain("Receive the exact normalized `delta`, evidence kind, and typed result/action");
  });

  it.each(Object.entries(workflows))("declares bounded residual judgment in %s", async (_name, path) => {
    const workflow = await readPair(path);
    const frontmatter = parseWorkflowFrontmatter(workflow);

    expect(frontmatter.parseError).toBeUndefined();
    expect(frontmatter.methods).toContain("assess-evidence-applicability");
    expect(workflow).toContain("**Method fire-point** · [`assess-evidence-applicability`]");
    expect(workflow).toMatch(/judgmentRequired: true[\s\S]*supplemental[\s\S]*fresh/iu);
    expect(workflow).toMatch(/merge-safety[\s\S]*never|never[\s\S]*merge-safety/iu);
  });

  it("invokes checkpoint and terminal merge once and dispatches their supplied continuations", async () => {
    const workflow = await readPair(workflows.integrate);

    expect(occurrences(workflow, "arc integrate checkpoint {name} --json")).toBe(1);
    expect(occurrences(
      workflow,
      "arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json",
    )).toBe(1);
    expect(workflow).toMatch(/state[^\n]+nextAction[\s\S]*supplied next\s+action/iu);
    expect(workflow).toContain("`queue-not-atomic`");
  });

  it("keeps eligibility mechanical and judges only a typed member-rewrite residual", async () => {
    const workflow = await readPair(workflows.deliver);

    expect(occurrences(workflow, "arc delivery eligibility prepare - --json")).toBe(1);
    expect(occurrences(workflow, "arc delivery eligibility close - --json")).toBe(1);
    expect(workflow).toMatch(/member-rewrite[\s\S]*judgmentRequired: true/iu);
    expect(workflow).toContain("selectionAction.projection.applicability.judgmentRequired: true");
    expect(workflow).toMatch(
      /mechanical eligibility[\s\S]*do(?:es)? not fire|do(?:es)? not fire[\s\S]*mechanical eligibility/iu,
    );
  });

  it("delegates the approved Errand effect to one terminal verb without workflow merge mechanics", async () => {
    const workflow = await readPair(workflows.errand);
    const terminal = sectionBetween(workflow, "5. **Settle the final head.", "### Complete");

    expect(occurrences(terminal, "arc errand merge <slug> - --json")).toBe(1);
    expect(terminal).not.toContain("gh pr merge");
    expect(terminal).not.toContain("arc review checks await");
    expect(terminal).not.toContain("arc merge lock hold");
    expect(occurrences(terminal, "arc merge lock release -")).toBe(1);
    expect(terminal).toMatch(/applicability-judgment-required[\s\S]*fresh integration approval/iu);
  });
});
