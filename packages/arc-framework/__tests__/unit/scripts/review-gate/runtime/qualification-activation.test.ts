import { describe, expect, it } from "vitest";

import {
  QUALIFICATION_CELL_IDS,
  appendQualificationCell,
  createQualificationCheckpoint,
  finalizeQualification,
} from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";
import {
  compileQualificationActivation,
  validateQualificationActivationDiff,
} from "../../../../../src/scripts/review-gate/runtime/qualification-activation.js";
import {
  parseSelfHostingPolicy,
  SELF_HOSTING_POLICY,
  type SourceQualificationDeclaration,
} from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import { qualificationCell, qualificationScope } from "./qualification-fixtures.js";

function acceptance(transform: (cell: ReturnType<typeof qualificationCell>) => ReturnType<typeof qualificationCell> = (cell) => cell) {
  const scope = qualificationScope();
  let checkpoint = createQualificationCheckpoint(scope);
  for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, transform(qualificationCell(cellId)));
  return finalizeQualification(scope, checkpoint);
}

describe("qualification activation compiler", () => {
  it("derives exact policy declarations and a provisional sanitized manifest slot", () => {
    const candidate = compileQualificationActivation(acceptance());
    expect(candidate.operations).toHaveLength(3);
    expect(candidate.operations[0]).toMatchObject({
      path: "packages/arc-framework/src/scripts/review-gate/policy/self-hosting/schema.ts",
      pointer: "/SELF_HOSTING_POLICY/qualifications/sourceIdentity=coderabbit-pr",
      value: expect.objectContaining({ sourceIdentity: "coderabbit-pr", mode: "enabled", transport: "durable-record" }),
    });
    expect(candidate.operations[1]).toMatchObject({
      path: "packages/arc-framework/src/scripts/review-gate/policy/self-hosting/schema.ts",
      pointer: "/SELF_HOSTING_POLICY/qualifications/sourceIdentity=codex-pr",
      value: expect.objectContaining({ sourceIdentity: "codex-pr", mode: "enabled", guidanceDigest: "e".repeat(64) }),
    });
    expect(candidate.operations[2]).toMatchObject({
      path: ".arc/reference/supplemental/analysis/analysis-review-gate-cutover-evidence.md",
      pointer: "/qualification/provisional",
      value: expect.objectContaining({
        sourceIdentities: { coderabbit: "coderabbit-pr", codex: "codex-pr" },
        capabilities: expect.any(Array),
        evidence: expect.any(Array),
      }),
    });
    expect(validateQualificationActivationDiff(candidate, candidate.operations)).toEqual([]);
    expect(() => parseSelfHostingPolicy({
      ...SELF_HOSTING_POLICY,
      qualifications: SELF_HOSTING_POLICY.qualifications.map((declaration) => {
        const replacement = candidate.operations.find((item) => item.pointer.endsWith(declaration.sourceIdentity));
        return replacement?.value as SourceQualificationDeclaration | undefined ?? declaration;
      }),
    })).not.toThrow();
  });

  it("rejects extra paths, omissions, manual edits, and digest drift", () => {
    const candidate = compileQualificationActivation(acceptance());
    expect(validateQualificationActivationDiff(candidate, [...candidate.operations, {
      path: "other", pointer: "/x", value: true, valueDigest: "f".repeat(64),
    }])).toEqual(expect.arrayContaining(["activation-operation-count-mismatch", "activation-path-set-mismatch"]));
    expect(validateQualificationActivationDiff(candidate, candidate.operations.slice(1)))
      .toContain("activation-operation-count-mismatch");
    expect(validateQualificationActivationDiff(candidate, candidate.operations.map((item, index) =>
      index === 0 ? { ...item, value: [] } : item))).toContain("activation-operation-mismatch:0");
  });

  it("preserves partial capabilities and refuses activation without one fully qualified hosted source", () => {
    const candidate = compileQualificationActivation(acceptance((cell) => cell.cellId.startsWith("coderabbit-")
      ? { ...cell, capabilityProven: false, outcome: "unknown" }
      : cell));
    expect(candidate.operations[0]).toMatchObject({ value: expect.objectContaining({ mode: "partial" }) });
    expect(candidate.operations[1]).toMatchObject({ value: expect.objectContaining({ mode: "enabled" }) });
    expect(() => compileQualificationActivation(acceptance((cell) =>
      cell.cellId.startsWith("coderabbit-")
        || (cell.cellId.startsWith("codex-")
          && cell.cellId !== "codex-connected-account"
          && cell.cellId !== "codex-clean")
        ? { ...cell, capabilityProven: false, outcome: "unknown" }
        : cell))).toThrow(/hosted-source-not-qualified/u);
  });
});
