/** Contract proof for delivery-plan authoring at task generation. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkflowFrontmatter } from "../../../src/scripts/audit-method-triggers.js";
import { indexOfSoftWrappedProse, softWrappedPattern, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");

describe("generate-tasks delivery authoring contract", () => {
  it("keeps provisional judgment unbound and sequences canonical authoring before finalization", () => {
    const packaged = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/generate-tasks.template.md"),
      "utf8",
    );
    const installed = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/generate-tasks.md"),
      "utf8",
    );
    const declarations = parseWorkflowFrontmatter(packaged);

    expect(declarations.methods).toContain("assess-boundary-fit");
    expect(packaged).toMatch(softWrappedProse("exactly one unmarked provisional `## Delivery Plan` locus"));
    expect(packaged).toMatch(softWrappedProse("does not create canonical delivery state"));
    expect(packaged).toMatch(softWrappedProse("derivation gap"));
    expect(packaged).toMatch(softWrappedProse("orthogonal concerns"));
    expect(packaged).toMatch(softWrappedProse("Incubating authoring remains provisional"));
    expect(packaged).toContain("arc delivery plan inventory schema --json");
    expect(packaged).toContain("arc delivery plan from-tasks --task-list");
    expect(packaged).toMatch(softWrappedProse("fill only the author slots"));
    expect(packaged).toContain("arc delivery compose");
    expect(packaged).toContain("delivery plan abandon");
    expect(packaged).toMatch(softWrappedProse("replaceable prebinding intent"));
    expect(packaged).toMatch(softWrappedProse("no ref, change request, state binding, or external projection mutation"));

    const compose = packaged.indexOf("arc delivery compose");
    const reread = packaged.indexOf("Post-settle coherence re-read", compose);
    const interlock = packaged.indexOf("`workflow-interlock`", reread);
    const finalize = packaged.indexOf("arc finalize generate-tasks", interlock);
    const commit = indexOfSoftWrappedProse(packaged, "`commit-interlock` release", finalize);
    expect(compose).toBeGreaterThan(0);
    expect(reread).toBeGreaterThan(compose);
    expect(interlock).toBeGreaterThan(reread);
    expect(finalize).toBeGreaterThan(interlock);
    expect(commit).toBeGreaterThan(finalize);
    expect(installed).toBe(packaged);
  });

  it("binds plan segmentation to residual risk and executable lifecycle proof", () => {
    const packaged = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/generate-tasks.template.md"),
      "utf8",
    );
    const installed = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/generate-tasks.md"),
      "utf8",
    );
    const packagedMethod = readFileSync(
      join(PACKAGE_ROOT, "arc/system/methods/resolve-plan-segmentation.md"),
      "utf8",
    );
    const installedMethod = readFileSync(
      join(PROJECT_ROOT, ".arc/system/methods/resolve-plan-segmentation.md"),
      "utf8",
    );

    for (const method of [packagedMethod, installedMethod]) {
      expect(method).toMatch(/\*\*Composition\*\*[^\n]*\*\*`slice`\*\*/u);
      expect(method).toMatch(/\*\*Substrate contract\*\*[^\n]*\*\*`layer`\*\*/u);
      expect(method).toMatch(/\*\*Mechanics at scale\*\*[^\n]*\*\*`replication`\*\*/u);
      expect(method).toMatch(softWrappedProse("Order segments to retire the dominant residual risk earliest"));
      expect(method).toMatch(softWrappedProse("place the first `slice` as early as its required substrate allows"));
    }

    for (const workflow of [packaged, installed]) {
      const segmentationStart = workflow.indexOf("## Resolve plan segmentation");
      const segmentationEnd = workflow.indexOf("## Generate in the resolved level", segmentationStart);
      expect(segmentationStart).toBeGreaterThan(-1);
      expect(segmentationEnd).toBeGreaterThan(segmentationStart);
      const segmentation = workflow.slice(segmentationStart, segmentationEnd);

      expect(segmentation).toMatch(
        softWrappedProse("resolve-plan-segmentation(scale-axis read, spec lifecycle statements) → ordered segments with modes"),
      );
      expect(segmentation).toContain("[`resolve-plan-segmentation`][arc-methods-rps]");
      expect(parseWorkflowFrontmatter(workflow).methods).toContain("resolve-plan-segmentation");

      expect(workflow).toMatch(softWrappedProse(
        "On a composition-risk plan, every mandatory lifecycle row stated by the spec is present in Success Criteria",
      ));
      expect(workflow).toMatch(softWrappedProse(
        "assigned to a `slice` segment or parent task that wires its production callsite and proves it with an executable scenario",
      ));
    }
  });

  it("authors member close-outs as scoped verification tasks with the canonical suffix", () => {
    const packaged = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/generate-tasks.template.md"),
      "utf8",
    );
    const installed = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/generate-tasks.md"),
      "utf8",
    );

    for (const workflow of [packaged, installed]) {
      const closeOutStart = indexOfSoftWrappedProse(workflow, "- End each member's task range");
      const closeOutEnd = indexOfSoftWrappedProse(workflow, "- Group Success Criteria", closeOutStart);
      expect(closeOutStart).toBeGreaterThan(-1);
      expect(closeOutEnd).toBeGreaterThan(closeOutStart);
      expect(workflow[closeOutEnd - 1]).toBe("\n");
      const memberCloseOut = workflow.slice(closeOutStart, closeOutEnd);

      expect(memberCloseOut).toMatch(softWrappedProse("member-scope verification parent"));
      expect(memberCloseOut).toContain("— validate criteria at member scope");
      expect(memberCloseOut).toMatch(softWrappedProse("sole terminal work-unit verification task"));
      expect(memberCloseOut).not.toMatch(softWrappedProse("ordinary implementation parent"));
    }
  });

  it("stops the grounding audit's confirm gate only for a phase that leaves something to decide", () => {
    const packaged = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/generate-tasks.template.md"),
      "utf8",
    );
    const installed = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/generate-tasks.md"),
      "utf8",
    );

    expect(installed).toBe(packaged);
    const between = (start: string, end: string): string => {
      const from = packaged.indexOf(start);
      const to = packaged.indexOf(end, from);
      expect(from).toBeGreaterThan(-1);
      expect(to).toBeGreaterThan(from);
      return packaged.slice(from, to);
    };
    const low = between("### `low`", "### `medium`");
    const medium = between("### `medium`", "### `high`");
    const high = between("### `high`", "## Structural decomposition");
    const loop = between("## Grounding audit & coherent revision", "### Audit the phase");
    const surface = between("### Surface findings + decisions, confirm what needs deciding", "**Re-entry valve");
    const grounding = between("## Grounding audit & coherent revision", "## Finalize the task list");

    expect(low).toMatch(softWrappedProse("stops for the single substantive phase only when its audit leaves something to decide"));
    expect(low).not.toMatch(softWrappedProse("The one review stop"));
    for (const path of [medium, high]) {
      expect(path).toMatch(softWrappedProse("stops only for a phase whose audit leaves something to decide"));
      expect(path).not.toMatch(softWrappedProse("fires once per substantive phase"));
    }
    expect(loop).toMatch(softWrappedProse("The phase-at-a-time loop is intrinsic at **every** depth"));
    expect(loop).toMatch(softWrappedProse("not the phase count or the resolved level"));
    expect(loop).not.toMatch(softWrappedProse("fires once per substantive phase at **every** depth"));
    expect(loop).toMatch(softWrappedProse("confirm before editing when the audit leaves something to decide"));
    expect(grounding).not.toMatch(softWrappedProse("then confirm"));
    expect(surface).toMatch(softWrappedProse(
      "When the phase's audit returns a fix-before-starting finding, a masked design decision, or a floor-raising signal",
    ));
    expect(surface).toMatch(softWrappedProse("A phase with nothing to decide does not stop."));
    expect(surface).toMatch(softWrappedProse("naming any \"carry as context\" findings and the home revision gives each"));

    for (const unchanged of [
      "Stop after the merged draft is written.",
      "Stop after the skeleton is drafted.",
      "Stop after the Pass 2 draft is written.",
      "Stop after a disproportionate provisional skeleton is identified.",
      "Stop after the pre-save checklist passes.",
    ]) {
      expect(packaged).toMatch(softWrappedProse(unchanged));
    }
  });

  it("teaches the member verifier shape in every shipped task-authoring reference", () => {
    const suffix = "— validate criteria at member scope";
    const references = [
      "arc/reference/templates/arc/work-unit/template-tasks.md",
      "arc/reference/strategies/arc/strategy-task-list-formatting.md",
    ];

    for (const relativePath of references) {
      const packaged = readFileSync(join(PACKAGE_ROOT, relativePath), "utf8");
      const installed = readFileSync(join(PROJECT_ROOT, ".arc", relativePath.replace(/^arc\//u, "")), "utf8");

      expect(installed).toBe(packaged);
      expect(packaged).toContain(suffix);
      expect(packaged).toMatch(/member(?:(?!\r?\n[ \t]*(?:>[ \t]*)?\r?\n)[\s\S])*range[\s\S]*?final[\s\S]{0,160}?(?:parent|task)/iu);
      expect(packaged).toMatch(softWrappedPattern(/sole\s+terminal\s+work-unit\s+verification\s+task/u));
    }
  });
});
