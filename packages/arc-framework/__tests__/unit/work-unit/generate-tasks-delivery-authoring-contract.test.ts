/** Contract proof for delivery-plan authoring at task generation. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkflowFrontmatter } from "../../../src/scripts/audit-method-triggers.js";
import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

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
    expect(packaged).toContain("derivation gap");
    expect(packaged).toContain("orthogonal concerns");
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
    const commit = packaged.indexOf("`commit-interlock` release", finalize);
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
      expect(method).toContain("Order segments to retire the dominant residual risk earliest");
      expect(method).toContain("place the first `slice` as early as its required substrate allows");
    }

    for (const workflow of [packaged, installed]) {
      const segmentationStart = workflow.indexOf("## Resolve plan segmentation");
      const segmentationEnd = workflow.indexOf("## Generate in the resolved level", segmentationStart);
      expect(segmentationStart).toBeGreaterThan(-1);
      expect(segmentationEnd).toBeGreaterThan(segmentationStart);
      const segmentation = workflow.slice(segmentationStart, segmentationEnd);

      expect(segmentation).toContain(
        "resolve-plan-segmentation(scale-axis read, spec lifecycle statements) → ordered segments with modes",
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
      const closeOutStart = workflow.indexOf("- End each member's task range");
      const closeOutEnd = workflow.indexOf("\n- Group Success Criteria", closeOutStart);
      expect(closeOutStart).toBeGreaterThan(-1);
      expect(closeOutEnd).toBeGreaterThan(closeOutStart);
      const memberCloseOut = workflow.slice(closeOutStart, closeOutEnd);

      expect(memberCloseOut).toContain("member-scope verification parent");
      expect(memberCloseOut).toContain("— validate criteria at member scope");
      expect(memberCloseOut).toContain("sole terminal work-unit verification task");
      expect(memberCloseOut).not.toContain("ordinary implementation parent");
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
      expect(packaged).toMatch(/member[^\n]*range[\s\S]*?final[\s\S]{0,160}?(?:parent|task)/iu);
      expect(packaged).toMatch(/sole terminal\s+work-unit verification\s+task/u);
    }
  });
});
