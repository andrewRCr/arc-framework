/** Contract proof for the shared retirement and extraction boundary. */

import { readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { shippedMethodForm } from "../../helpers/shipped-method-form.js";
import { softWrappedPattern, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");
const SHARED_BOUNDARY = "Extraction is the supported source-preserving arm for a started `Planning` or `Active` "
  + "source. It is entered through its own command mode, and the core retirement transform remains unchanged.";

const relativePaths = [
  "system/methods/assess-boundary-fit.md",
  "system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
  "reference/strategies/arc/strategy-work-organization.md",
] as const;

const EARLY_START = softWrappedPattern(/starting\s+one\s+before\s+the\s+terminal\s+batch\s+is\s+deliberate/iu);

function assertExtractionDoctrine(workflow: string, strategy: string): void {
  expect(workflow).toMatch(softWrappedProse("Extraction writes no lineage record: its origin survives."));
  expect(workflow).toMatch(softWrappedProse("It stores no launch advice, publication packet, or selected successor."));
  expect(strategy).toMatch(softWrappedProse("The surviving origin is the natural continuation"));
  const additive = workflow.slice(workflow.indexOf("## 3. Write the additive batch"), workflow.indexOf("## 4. "));
  expect(additive).toMatch(softWrappedProse("Every checkout sees the members as ordinary stubs"));
  expect(additive).toMatch(EARLY_START);
}

describe("decomposition doctrine contract", () => {
  it("states one retirement and extraction boundary on every shipped surface", () => {
    for (const relativePath of relativePaths) {
      const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
      expect(packaged, relativePath).toMatch(softWrappedProse(SHARED_BOUNDARY));
    }
  });

  it("keeps every self-hosted projection aligned with its package source", () => {
    for (const relativePath of relativePaths) {
      const packaged = readFileSync(join(PACKAGE_ROOT, "arc", relativePath), "utf8");
      const installed = readFileSync(join(PROJECT_ROOT, ".arc", relativePath), "utf8");
      expect(shippedMethodForm(installed, basename(relativePath, ".md")), relativePath).toBe(packaged);
    }
  });

  it("keeps extraction lineage-free and lifecycle-derived", () => {
    const workflow = readFileSync(join(PACKAGE_ROOT, "arc", relativePaths[1]), "utf8");
    const strategy = readFileSync(join(PACKAGE_ROOT, "arc", relativePaths[2]), "utf8");
    assertExtractionDoctrine(workflow, strategy);
  });

  it("detects a missing early-start rule in the additive batch", () => {
    const workflow = readFileSync(join(PACKAGE_ROOT, "arc", relativePaths[1]), "utf8");
    const strategy = readFileSync(join(PACKAGE_ROOT, "arc", relativePaths[2]), "utf8");
    const withoutEarlyStart = workflow.replace(EARLY_START, "");
    expect(withoutEarlyStart).not.toBe(workflow);
    expect(() => assertExtractionDoctrine(withoutEarlyStart, strategy)).toThrow();
  });
});
