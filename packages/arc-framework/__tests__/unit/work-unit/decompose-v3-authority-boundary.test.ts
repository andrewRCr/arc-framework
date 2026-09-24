/** Source-graph proof that decomposition exposes one version-3 authority boundary. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { softWrappedProse } from "../../helpers/soft-wrapped-prose.js";
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
      "lib/work-unit/decompose-preparation.ts",
      "lib/work-unit/decompose-finalization.ts",
      "lib/work-unit/decompose-finalization-recovery.ts",
      "lib/work-unit/decompose-v3-preparation.ts",
      "lib/work-unit/decompose-v3-receipt.ts",
      "lib/work-unit/retirement-receipt-codec.ts",
      "lib/work-unit/retirement-record-store.ts",
      "scripts/validate-decompose-record.ts",
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

  it("carries no receipt-era transaction vocabulary in production", () => {
    const forbidden = new Set([
      "V3CandidatePublication",
      "V3CandidatePublicationSchema",
      "V3DecomposeReceipt",
      "V3DecomposeReceiptSchema",
      "candidatePublication",
      "candidateAuthority",
      "projectV3CandidateAuthority",
      "receiptId",
      "preparationId",
      "initialContinuation",
      "validateReceiptMatrix",
    ]);

    expect(identifierViolations(forbidden)).toEqual([]);
  });

  it("keeps receipt-free base advancement independent of retired codecs and authorities", () => {
    const advancement = join(SOURCE_ROOT, "lib/work-unit/git-decompose-transition-base-advancement.ts");
    const content = readFileSync(advancement, "utf8");

    expect(content).not.toMatch(
      /retirement-receipt|retirement-authority|decompose-v3-receipt|decompose[^\n]*preparation|decompose[^\n]*finalization/iu,
    );
  });

  it("keeps shipped methodology v3-only and its project projection synchronized", () => {
    const packageMethod = readFileSync(join(PACKAGE_ROOT, "arc/system/methods/assess-boundary-fit.md"), "utf8");
    const projectMethod = readFileSync(
      join(PROJECT_ROOT, ".arc/system/methods/assess-boundary-fit.md"),
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
    expect(packageMethod).toContain("name: assess-boundary-fit");
    expect(packageMethod).toMatch(softWrappedProse("stays one WU + delivery-plan candidate"));
    expect(packageMethod).toContain("new-evidence delta");
    expect(packageMethod).toMatch(softWrappedProse("concern multiplicity is a third axis"));
    expect(packageMethod).not.toContain("parentPosition");
    expect(packageMethod).not.toContain("surviving-origin");
    expect(packageMethod).toMatch(/core retirement\s+transform remains unchanged/u);
    expect(packageMethod).toContain("`retained-origin`");
    expect(projectPark).toBe(packagePark);
    expect(packagePark).not.toContain("#the-park-exit-block");
  });
});
