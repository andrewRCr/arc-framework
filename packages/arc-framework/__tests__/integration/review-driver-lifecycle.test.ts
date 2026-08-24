import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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
      "arc review chunking resolve -",
      "arc review resolve -",
      "arc review hosted request -",
      "arc review hosted await -",
      "arc review hosted settle -",
    ]) expect(packaged).toContain(command);
    expect(packaged).toContain("review applicability");
    expect(packaged).toContain("targeted verification");
    expect(packaged).toContain("agent-selected supplemental review");
    expect(packaged).toContain("`settlement: reply-and-resolve`");
    expect(packaged).toContain("`settlement: not-applicable`");
    expect(packaged).toContain("originating `target`");
    expect(packaged).toContain("changed `fixTarget`");
    expect(packaged).toContain("`coverage: incremental`");
    expect(packaged).toContain("`effectiveCoverage: complete`");
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
    expect(workflow).toContain("arc review status --target '{targetRef}' --json");
    expect(workflow.indexOf("arc review status --target '{targetRef}' --json"))
      .toBeLessThan(workflow.indexOf("arc review hosted request -"));
    expect(workflow).toContain("checkpoint now owns Candidate applicability, ordinary publication settlement");
    expect(workflow).toMatch(/delivery\s+rebind, review status, and final readiness/u);
    expect(workflow).toContain("arc merge lock resolve -");
    expect(workflow).toContain("arc integrate checkpoint {name} --json");
    expect(workflow).toContain("arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json");
    expect(workflow).toContain("Approve (or redirect)?");
    expect(preparation).toMatch(/runtime-owned bindings/i);
    expect(workflow).toContain("no-action record-only");
    expect(workflow).not.toContain("`Coverage`");
    expect(workflow).not.toContain("arc review readiness -");
    expect(workflow).not.toContain("arc merge lock release -");
    expect(workflow).not.toContain("arc merge lock hold -");
  });

  it("resolves the carried WU reservation before requesting hosted review", async () => {
    const workflow = await readFile(resolve(packageArc, integrateWorkflow), "utf8");

    expect(workflow).toContain("invoke `integrationBoundary.nextAction.command`");
    expect(workflow).toContain("`ready / hosted-request`");
    expect(workflow).toContain("`policy.payload.pass`");
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
      expect(errand).toContain(pair);
    }
    expect(workUnit).toContain("selected `assess-boundary-fit` outcome and its evidence basis");
    expect(workUnit).toContain("semantically unchanged");
    expect(workUnit).toContain("material deltas");
    expect(workUnit).toContain("render `recommendedActionText` verbatim");
    expect(workUnit).toContain("never also offer chunked review");
    expect(errand).toContain("An Errand has no owning work unit");
    expect(errand).toContain("without adding delivery judgment");
    expect(errand).toContain("follow the closed attention dispatch in Step 2");
  });

  it("carries a content-gated local-review attestation instead of a composed record", async () => {
    const path = "reference/templates/arc/work-unit/template-pull-request.md";
    const [packaged, project] = await Promise.all([
      readFile(resolve(packageArc, path), "utf8"),
      readFile(resolve(projectArc, path), "utf8"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toContain("**Local review:** {carrier identity}");
    expect(packaged).toContain("**Local review — content-gated.**");
    expect(packaged).toContain("Omit the field entirely when no local review ran");
    expect(packaged).not.toContain("## Review");
    expect(packaged).not.toContain("**Hosted PR:**");
    expect(packaged).not.toContain("**Triage:**");
    expect(packaged).not.toContain("**Coverage:**");
    expect(packaged).toContain("## Delivery-Member Variant");
    expect(packaged).toContain("Do not add a `Delivery` field");
    expect(packaged).toContain("Design is content-gated for delivery members");
    expect(packaged).toContain("{work-unit-slug} [{position}/{total}]: {member title}");
  });
});
