/** Contract proof for delivery-plan authoring at task generation. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseWorkflowFrontmatter } from "../../../src/scripts/audit-method-triggers.js";

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
    expect(packaged).toContain("exactly one unmarked provisional `## Delivery Plan` locus");
    expect(packaged).toContain("does not create canonical delivery state");
    expect(packaged).toContain("derivation gap");
    expect(packaged).toContain("orthogonal concerns");
    expect(packaged).toContain("Incubating authoring remains provisional");
    expect(packaged).toContain("arc delivery plan inventory schema --json");
    expect(packaged).toContain("arc delivery plan from-tasks --task-list");
    expect(packaged).toContain("fill only the author slots");
    expect(packaged).toContain("arc delivery compose");
    expect(packaged).toContain("delivery plan abandon");
    expect(packaged).toContain("replaceable prebinding intent");
    expect(packaged).toContain("no ref, change request, state binding, or external projection mutation");

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
});
