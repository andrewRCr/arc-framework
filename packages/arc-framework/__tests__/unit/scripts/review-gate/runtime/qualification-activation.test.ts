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
import { qualificationCell, qualificationScope } from "./qualification-fixtures.js";

function acceptance() {
  const scope = qualificationScope();
  let checkpoint = createQualificationCheckpoint(scope);
  for (const cellId of QUALIFICATION_CELL_IDS) checkpoint = appendQualificationCell(scope, checkpoint, qualificationCell(cellId));
  return finalizeQualification(scope, checkpoint);
}

describe("qualification activation compiler", () => {
  it("derives exact policy declarations and a provisional sanitized manifest slot", () => {
    const candidate = compileQualificationActivation(acceptance());
    expect(candidate.operations).toHaveLength(2);
    expect(candidate.operations[0]).toMatchObject({
      path: "packages/arc-framework/src/scripts/review-gate/policy/self-hosting/schema.ts",
      pointer: "/SELF_HOSTING_POLICY/qualifications",
    });
    expect(candidate.operations[1]).toMatchObject({
      path: ".arc/reference/supplemental/research/research-review-gate-cutover-evidence.md",
      pointer: "/qualification/provisional",
    });
    expect(validateQualificationActivationDiff(candidate, candidate.operations)).toEqual([]);
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
});
