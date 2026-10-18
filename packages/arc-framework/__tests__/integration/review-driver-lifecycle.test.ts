import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../helpers/soft-wrapped-prose.js";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

const integrateWorkflow = "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md";
const prepareWorkflow = "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md";
const errandWorkflow = "system/workflows/arc/supplemental/run-errand.md";
const workflows = [integrateWorkflow, errandWorkflow];

describe("lifecycle review driver", () => {
  it.each(workflows)("projects the same typed driver through %s", async (path) => {
    const [packaged, project] = await Promise.all([
      readFile(resolve(packageArc, path), "utf8"),
      readFile(resolve(projectArc, path), "utf8"),
    ]);
    expect(project).toBe(packaged);
    for (const command of [
      "arc review resolve -",
      "arc review hosted request -",
      "arc review hosted await -",
      "arc review hosted settle -",
    ]) expect(packaged).toContain(command);
    if (path === integrateWorkflow) {
      expect(packaged).toContain("arc review changeset resolve -");
    } else {
      expect(packaged).not.toContain("arc review changeset resolve -");
      expect(packaged).toContain("Errand atomicity fixes each role's");
    }
    expect(packaged).toContain("review applicability");
    expect(packaged).toContain("assess-evidence-applicability");
    expect(packaged).toContain("judgmentRequired: true");
    expect(packaged).toContain("supplemental | fresh");
    expect(packaged).not.toContain("agent-selected supplemental review");
    expect(packaged).toContain("`settlement: reply-and-resolve`");
    expect(packaged).toContain("`settlement: not-applicable`");
    expect(packaged).toContain("originating `target`");
    expect(packaged).toContain("changed `fixTarget`");
    if (path === errandWorkflow) {
      expect(packaged).toContain("`coverage: complete`; fix checks run locally");
      expect(packaged).toContain("`coverageAdmission`");
    } else {
      expect(packaged).toContain("`coverage: incremental`");
      expect(packaged).toContain("`effectiveCoverage: complete`");
    }
    expect(packaged).not.toContain("`Coverage`");
    expect(packaged).toMatch(
      /never invoke `hosted settle`, post a reply or\s+compensating\s+summary\s+comment/u,
    );
    expect(packaged).not.toContain("project review coordinator");
    expect(packaged).not.toContain("coordinate-pr-review");
  });

  it("combines WU convergence, exact-head status, and checkpointed merge disclosure", async () => {
    const [workflow, preparation] = await Promise.all([
      readFile(resolve(packageArc, integrateWorkflow), "utf8"),
      readFile(resolve(packageArc, prepareWorkflow), "utf8"),
    ]);
    expect(workflow).toContain("arc review change-request resolve --head-ref");
    expect(workflow).toContain("arc review status --target '{targetRef}'");
    expect(workflow.indexOf("arc review status --target '{targetRef}'"))
      .toBeLessThan(workflow.indexOf("arc review hosted request -"));
    expect(workflow).toMatch(softWrappedProse("checkpoint now owns Candidate applicability, ordinary publication settlement"));
    expect(workflow).toMatch(/delivery\s+rebind, review status, and final readiness/u);
    expect(workflow).toContain("arc merge lock resolve -");
    expect(workflow).toContain("arc integrate checkpoint {name}");
    expect(workflow).toContain("arc integrate merge {name} --checkpoint {payload.checkpointHandle}");
    expect(workflow).toContain("Approve (or redirect)?");
    expect(workflow).toMatch(
      /not\s*(?:>\s*)?an instruction to invoke merge this turn while those checks are pending/iu,
    );
    expect(preparation).toMatch(/runtime-owned bindings/i);
    expect(workflow).toContain("no-action record-only");
    expect(workflow).not.toContain("`Coverage`");
    expect(workflow).not.toContain("arc review readiness -");
    expect(workflow).not.toContain("arc merge lock release -");
    expect(workflow).not.toContain("arc merge lock hold -");
  });

  it("resumes the carried WU reservation through public review status", async () => {
    const workflow = await readFile(resolve(packageArc, integrateWorkflow), "utf8");

    expect(workflow).toContain("integrationBoundary.nextAction.command");
    expect(workflow).toContain("`resolve-delivery-status`");
    expect(workflow).toMatch(softWrappedProse("selects the first outstanding retained member"));
  });

  it("keeps attention suppression with the owner of each judgment", async () => {
    const [workUnit, errand] = await Promise.all([
      readFile(resolve(packageArc, prepareWorkflow), "utf8"),
      readFile(resolve(packageArc, errandWorkflow), "utf8"),
    ]);
    for (const pair of [
      "disabled / none",
      "below-threshold / continue-review",
      "scope-selected / continue-review",
      "evidence-unavailable / continue-review",
      "consider-chunks / select-review-scope",
      "delivery-bound / continue-review",
    ]) {
      expect(workUnit).toContain(pair);
      expect(errand).not.toContain(pair);
    }
    expect(workUnit).toMatch(softWrappedProse("selected `assess-boundary-fit` outcome and its evidence basis"));
    expect(workUnit).toContain("semantically unchanged");
    expect(workUnit).toContain("material deltas");
    expect(workUnit).toContain("render `recommendedActionText` verbatim");
    expect(workUnit).toContain("never also offer chunked review");
    expect(errand).toMatch(/chunk selection is not an\s+Errand review action/u);
    expect(errand).toMatch(softWrappedProse("Bind the opened target's `scopeSelection` directly to whole-target"));
  });

  it("shares an overridable change-focused policy with binding title constraints", async () => {
    const errand = await readFile(resolve(packageArc, errandWorkflow), "utf8");
    expect(errand).toContain("    - pull-request-format");
    const path = "system/methods/pull-request-format.md";
    const [packaged, project] = await Promise.all([
      readFile(resolve(packageArc, path), "utf8"),
      readFile(resolve(projectArc, path), "utf8"),
    ]);
    expect(project).toBe(packaged);
    const contract = packaged.slice(packaged.indexOf("> - **Contract:**"), packaged.indexOf("## pull-request-format.override"));
    expect(contract).toContain("squash");
    expect(contract).toContain("valid commit subject");
    expect(contract).toContain("multi-member delivery");
    for (const type of ["feat", "fix", "chore", "docs", "refactor", "test", "perf", "revert"]) {
      expect(contract).toContain(`\`${type}\``);
    }
    const headings = ["## Summary", "## Changes", "## Notes for Reviewers", "## Test Plan", "## Out of Scope"];
    const block = packaged.match(/```markdown\n([\s\S]*?)```/u)?.[1] ?? "";
    expect(block.match(/^## .+$/gmu)).toEqual(headings);
    expect(block.match(/Omit/gu)).toHaveLength(4);
    expect(packaged).toMatch(softWrappedProse("A credible alternative existed and the rationale is not visible in the diff"));
    expect(packaged).toMatch(softWrappedProse("Errands list every qualifying decision"));
    expect(packaged).toContain("commit-pinned permalink");
    expect(packaged).toContain("spec-{name}-prd.md");
    expect(packaged).toContain("spec-{name}-rfc.md");
    expect(packaged).toContain("inherited defaults");
    expect(packaged).toContain("undisclosed vulnerability");
    expect(packaged).toContain("No process, provenance, or review metadata");
    expect(packaged).toMatch(softWrappedProse("Do not supply a design reference"));
  });
});
