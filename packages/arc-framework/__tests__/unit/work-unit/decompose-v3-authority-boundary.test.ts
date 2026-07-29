/** Source-graph proof that decomposition exposes one version-3 authority boundary. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE_ROOT = join(PACKAGE_ROOT, "src");
const PROJECT_ROOT = resolve(PACKAGE_ROOT, "../..");

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function identifierViolations(forbidden: ReadonlySet<string>): { file: string; identifier: string }[] {
  const violations: { file: string; identifier: string }[] = [];
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isIdentifier(node) && forbidden.has(node.text)) {
        violations.push({ file: relative(SOURCE_ROOT, file), identifier: node.text });
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return violations;
}

describe("decomposition v3 authority boundary", () => {
  it("ships no legacy authoring or executor modules", () => {
    const removedModules = [
      "lib/work-unit/decompose-cut-map-schema.ts",
      "lib/work-unit/decompose-cut-map.ts",
      "lib/work-unit/verbs/decompose.ts",
    ];

    expect(removedModules.filter((path) => existsSync(join(SOURCE_ROOT, path)))).toEqual([]);
  });

  it("exposes no legacy preparation, finalization, or execution identifiers", () => {
    const forbidden = new Set([
      "DecomposeAllocationMap",
      "DecomposeAllocationMapSchema",
      "DecomposeAllocationMapStructuralSchema",
      "DecomposePreparationContext",
      "DecomposePreparationProjection",
      "DecomposePreparationRecord",
      "PreparedDecomposeRetirement",
      "prepareDecomposeRetirement",
      "DecomposeFinalizationContext",
      "DecomposeFinalizationProjection",
      "DecomposeFinalTarget",
      "finalizeDecomposeRetirement",
      "parseCutMap",
      "runPreparedDecompose",
      "runDecompose",
      "scaffoldCohortMembers",
    ]);

    expect(identifierViolations(forbidden)).toEqual([]);
  });

  it("retains the positive v3 preparation and finalization boundary", () => {
    const preparation = readFileSync(join(SOURCE_ROOT, "lib/work-unit/decompose-preparation.ts"), "utf8");
    const finalization = readFileSync(join(SOURCE_ROOT, "lib/work-unit/decompose-finalization.ts"), "utf8");

    expect(preparation).toContain("prepareV3DecomposeRetirement");
    expect(finalization).toContain("finalizeV3DecomposeRetirement");
  });

  it("keeps shipped methodology v3-only and its project projection synchronized", () => {
    const packageMethod = readFileSync(join(PACKAGE_ROOT, "arc/system/methods/assess-cohort-fit.md"), "utf8");
    const projectMethod = readFileSync(
      join(PROJECT_ROOT, ".arc/system/methods/assess-cohort-fit.md"),
      "utf8",
    );
    const packagePark = readFileSync(
      join(PACKAGE_ROOT, "arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md"),
      "utf8",
    );
    const projectPark = readFileSync(
      join(PROJECT_ROOT, ".arc/system/workflows/arc/work-unit-lifecycle/park-work-unit.md"),
      "utf8",
    );

    expect(projectMethod).toBe(packageMethod);
    expect(packageMethod).not.toContain("parentPosition");
    expect(packageMethod).not.toContain("surviving-origin");
    expect(packageMethod).toContain("outside the core");
    expect(projectPark).toBe(packagePark);
    expect(packagePark).not.toContain("#the-park-exit-block");
  });
});
