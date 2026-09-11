/** Structural contracts for typed terminal workflow dispatch and bounded residual judgment. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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

describe("evidence applicability workflow fire-points", () => {
  it("renders scoped convergence only from the typed pre-publication action", async () => {
    const workflow = await readPair(prepareWorkflow);

    expect(workflow).toContain("`nextAction.requiredScope`");
    expect(workflow).toContain("`nextAction.verificationKind`");
    expect(workflow).toContain("`nextAction.attestArgv`");
    expect(workflow).toContain("`{verificationEvidenceRef}`");
    expect(workflow).toMatch(/never select a\s+verification scope in prose/iu);
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
    const terminal = workflow.slice(workflow.indexOf("5. **Settle the final head."), workflow.indexOf("### Complete"));

    expect(occurrences(terminal, "arc errand merge <slug> - --json")).toBe(1);
    expect(terminal).not.toContain("gh pr merge");
    expect(terminal).not.toContain("arc review checks await");
    expect(terminal).not.toContain("arc merge lock hold");
    expect(occurrences(terminal, "arc merge lock release -")).toBe(1);
    expect(terminal).toMatch(/applicability-judgment-required[\s\S]*fresh integration approval/iu);
    expect(terminal).toMatch(/arc base drift --json[\s\S]*last-observed base OID/iu);
    expect(terminal).toMatch(/required checks are bound to the approved head[\s\S]*residual race/iu);
    expect(terminal).toMatch(/base OID qualifies the evidence but is not merge authority/iu);
  });

  it("dispatches the coordinate-bound currentness remedy returned by terminal integration", async () => {
    const workflow = await readPair(workflows.integrate);

    expect(workflow).toMatch(
      /invalidated \/ reconcile-base[\s\S]*remedy\.argv[\s\S]*--expected-base[\s\S]*--expected-head/iu,
    );
  });
});
