/** Structural contracts for typed terminal workflow dispatch and bounded residual judgment. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

import { parseWorkflowFrontmatter } from "../../src/scripts/audit-method-triggers.js";

const root = resolve(import.meta.dirname, "../../../..");

const prepareWorkflow = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";

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
  it("renders scoped convergence only from the typed pre-publication action", async () => {
    const workflow = await readPair(prepareWorkflow);

    expect(workflow).toContain("`nextAction.requiredScope`");
    expect(workflow).toContain("arc check gate push --range --force");
    expect(workflow).toContain("arc check gate merge --force");
    expect(workflow).toContain("`nextAction.verificationKind`");
    expect(workflow).toContain("`nextAction.attestArgv`");
    expect(workflow).toContain("`{verificationEvidenceRef}`");
    expect(workflow).toMatch(/never\s+select\s+a\s+verification\s+scope\s+in\s+prose/iu);
  });

  it("requires only the typed bounded result that every fire-point actually supplies", async () => {
    const method = await readPair("system/methods/assess-evidence-applicability.md");

    expect(method).toMatch(softWrappedProse("Receive the supplied typed applicability result or projection"));
    expect(method).not.toMatch(softWrappedProse("Receive the exact normalized `delta`, evidence kind, and typed result/action"));
  });

  it.each(Object.entries(workflows))("declares bounded residual judgment in %s", async (_name, path) => {
    const workflow = await readPair(path);
    const frontmatter = parseWorkflowFrontmatter(workflow);

    expect(frontmatter.parseError).toBeUndefined();
    expect(frontmatter.methods).toContain("assess-evidence-applicability");
    expect(workflow).toContain("**Method fire-point** · [`assess-evidence-applicability`]");
    expect(workflow).toMatch(/judgmentRequired:\s+true[\s\S]*supplemental[\s\S]*fresh/iu);
    expect(workflow).toMatch(/merge-safety[\s\S]*never|never[\s\S]*merge-safety/iu);
  });

  it("invokes checkpoint and terminal merge once and dispatches their supplied continuations", async () => {
    const workflow = await readPair(workflows.integrate);

    expect(occurrences(workflow, "arc integrate checkpoint {name}")).toBe(1);
    expect(occurrences(
      workflow,
      "arc integrate merge {name} --checkpoint {payload.checkpointHandle}",
    )).toBe(1);
    expect(workflow).toMatch(softWrappedProse(
      "Dispatch only on its typed `state` / `nextAction`, render the supplied next action",
    ));
    expect(workflow).toContain("`queue-not-atomic`");
  });

  it("keeps eligibility mechanical and judges only a typed member-rewrite residual", async () => {
    const workflow = await readPair(workflows.deliver);

    expect(occurrences(workflow, "arc delivery eligibility prepare -")).toBe(1);
    expect(occurrences(workflow, "arc delivery eligibility close -")).toBe(1);
    expect(workflow).toMatch(/member-rewrite[\s\S]*judgmentRequired:\s+true/iu);
    expect(workflow).toContain("selectionAction.projection.applicability.judgmentRequired: true");
    expect(workflow).toMatch(
      /mechanical\s+eligibility[\s\S]*do(?:es)?\s+not\s+fire|do(?:es)?\s+not\s+fire[\s\S]*mechanical\s+eligibility/iu,
    );
  });

  it("delegates the approved Errand mutation to one terminal verb after a read-only check wait", async () => {
    const workflow = await readPair(workflows.errand);
    const terminal = sectionBetween(workflow, "5. **Settle the final head.", "### Complete");

    expect(occurrences(terminal, "arc errand merge <slug> - --json")).toBe(1);
    expect(occurrences(terminal, "arc review checks await")).toBe(1);
    expect(terminal.indexOf("arc review checks await"))
      .toBeLessThan(terminal.indexOf("arc errand merge <slug> - --json"));
    expect(terminal).not.toContain("gh pr merge");
    expect(terminal).not.toContain("arc merge lock hold");
    expect(occurrences(terminal, "arc merge lock release -")).toBe(1);
    expect(terminal).toMatch(/applicability-judgment-required[\s\S]*fresh\s+integration\s+approval/iu);
    expect(terminal).toMatch(/arc base drift --json[\s\S]*last-observed\s+base\s+OID/iu);
    expect(terminal).toMatch(/required\s+checks\s+are\s+bound\s+to\s+the\s+approved\s+head[\s\S]*residual\s+race/iu);
    expect(terminal).toMatch(/base\s+OID\s+qualifies\s+the\s+evidence\s+but\s+is\s+not\s+merge\s+authority/iu);
  });

  it("dispatches the coordinate-bound currentness remedy returned by terminal integration", async () => {
    const workflow = await readPair(workflows.integrate);

    expect(workflow).toMatch(
      /invalidated\s+\/\s+reconcile-base[\s\S]*remedy\.argv[\s\S]*--expected-base[\s\S]*--expected-head/iu,
    );
  });
});
