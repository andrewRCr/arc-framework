import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../..");
const ROOTS = [
  resolve(ROOT, "packages/arc-framework/arc"),
  resolve(ROOT, ".arc"),
];

describe("prepublication workflow boundary", () => {
  it("keeps private review before publish and integration after it", async () => {
    for (const root of ROOTS) {
      const integrate = await readFile(
        resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
        "utf8",
      );

      expect(integrate).not.toContain("arc review pre-publication <wu> --json");
      expect(integrate).not.toContain("arc review local prepare -");
      expect(integrate).toContain("**When to use:** `active/meta-{name}.md` shows `**State:** Integrating`");
      expect(integrate).toContain("### 1) Push the branch and open the PR");

      const prepare = await readFile(
        resolve(root, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"),
        "utf8",
      );
      expect(prepare).toContain("# Workflow: Prepare Work Unit for Publication");
      expect(prepare).toContain("arc review pre-publication <wu> --json");
      expect(prepare).toContain("arc review local prepare -");
      expect(prepare).toContain("arc publish {name} --json");
      expect(prepare).not.toContain("gh pr create");
      expect(prepare).not.toContain("arc integrate checkpoint");
    }
  });

  it("keeps packaged and project workflow copies identical", async () => {
    const [packagedPrepare, projectPrepare, packagedIntegrate, projectIntegrate] = await Promise.all([
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[0]!, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
      readFile(resolve(ROOTS[1]!, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
    ]);

    expect(projectPrepare).toBe(packagedPrepare);
    expect(projectIntegrate).toBe(packagedIntegrate);
  });

  it("ships the preparation workflow through the installation recipe", async () => {
    const recipe = JSON.parse(await readFile(resolve(ROOT, "packages/arc-framework/init-recipe.json"), "utf8")) as {
      include_files: string[];
    };

    expect(recipe.include_files)
      .toContain("system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md");
    expect(recipe.include_files)
      .toContain("reference/templates/arc/work-unit/template-pull-request.md");
  });

  it("closes verification before attestation and hands execution off to preparation", async () => {
    for (const root of ROOTS) {
      const [verification, taskLoop] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/verify-work-unit.md"), "utf8"),
        readFile(resolve(root, root === ROOTS[0]
          ? "system/workflows/arc/process-task-loop.template.md"
          : "system/workflows/arc/process-task-loop.md"), "utf8"),
      ]);

      expect(verification.indexOf("mark the single verification task `[x]`")).toBeGreaterThan(-1);
      expect(verification.indexOf("arc attest {name} --json"))
        .toBeGreaterThan(verification.indexOf("mark the single verification task `[x]`"));
      expect(taskLoop).toContain("to prepare-work-unit` (verification complete — execution end)");
      expect(taskLoop).toContain("prepare-work-unit are all valid retargets");
      expect(taskLoop).not.toContain("integrate are all valid retargets");
      expect(taskLoop).toMatch(/When all tasks are marked complete[\s\S]*proceed to Candidate preparation/iu);
    }
  });

  it("restarts checkpointing after reconcile and returns inline archival to the final push", async () => {
    for (const root of ROOTS) {
      const [integrate, archive] = await Promise.all([
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"), "utf8"),
        readFile(resolve(root, "system/workflows/arc/work-unit-lifecycle/archive-work-unit.md"), "utf8"),
      ]);

      const cleanRestart = integrate.indexOf("`clean` restarts this step without a commit");
      const readyCheckpoint = integrate.indexOf("On `ready / request-approval`");
      expect(cleanRestart).toBeGreaterThan(-1);
      expect(readyCheckpoint).toBeGreaterThan(cleanRestart);
      expect(integrate).toContain("Context: meta-{name}.md (integration)");
      expect(integrate).not.toContain("Context: meta-{name}.md (integration reconcile)");
      expect(archive).toContain("per `integrate-work-unit.md` Steps 5–7");
      expect(archive).toContain("Step 9 —\n  the final integration push");
      expect(archive).not.toContain("Step 10 —\n  the final integration push");
    }
  });

  it("distinguishes review-fix and lifecycle-ceremony context footers", async () => {
    for (const root of ROOTS) {
      const [footer, selfReview] = await Promise.all([
        readFile(resolve(root, "system/methods/commit-footer.md"), "utf8"),
        readFile(resolve(root, "system/methods/self-review.md"), "utf8"),
      ]);

      expect(footer).toContain("meta-[name].md (prepublication)");
      expect(footer).toContain("meta-[name].md (integration)");
      expect(selfReview).toContain("finding-driven fixes with the canonical `(code review)` context footer");
      expect(selfReview).not.toMatch(/finding-driven fixes[\s\S]{0,120}`\(prepublication\)`/u);
    }
  });
});
