import { describe, expect, it, vi } from "vitest";

import type { CanonicalChange, ChangeSet } from "../../../src/lib/change-facts.js";
import {
  classifyDecompositionPlanningLane,
  type DecompositionPlanningLaneDependencies,
} from "../../../src/lib/work-unit/decomposition-planning-lane.js";
import { V3_DECOMPOSITION_READ_FAILURE } from "../../../src/lib/work-unit/validate-v3-decomposition.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const BASE = "b".repeat(40);
const HEAD = "c".repeat(40);

function change(path: string, status: CanonicalChange["status"] = "added"): CanonicalChange {
  if (status === "added") return { status, path, oldMode: "000000", newMode: "100644" };
  if (status === "deleted") return { status, path, oldMode: "100644", newMode: "000000" };
  return { status: "modified", path, oldMode: "100644", newMode: "100644" };
}

function exactChangeSet(): { changeSet: ChangeSet; receipt: ReturnType<typeof v3DecompositionEvidenceFixture>["receipt"] } {
  const { receipt } = v3DecompositionEvidenceFixture();
  return {
    receipt,
    changeSet: {
      changeSet: "known",
      changes: [
        ...receipt.finalized.transitionPatch.map(({ path, before, after }) => change(
          path,
          before.kind === "absent" ? "added" : after.kind === "absent" ? "deleted" : "modified",
        )),
        change(`.arc/system/.internal/retirement-receipts/${receipt.receiptId.replace(":", "-")}.json`),
      ],
    },
  };
}

function dependencies(
  receipt: ReturnType<typeof v3DecompositionEvidenceFixture>["receipt"],
  overrides: Partial<DecompositionPlanningLaneDependencies> = {},
): DecompositionPlanningLaneDependencies {
  return {
    readReceipt: vi.fn(async () => ({ status: "read" as const, receipt })),
    assemble: vi.fn(async () => ({ status: "assembled" as const, facts: {} as never })),
    validateCanonical: vi.fn(() => ({ status: "validated" as const, authority: {} as never })),
    validateLanding: vi.fn(async () => ({
      status: "admitted" as const,
      binding: { currentBaseOid: BASE, candidateHeadOid: HEAD },
    })),
    ...overrides,
  };
}

describe("decomposition planning lane", () => {
  it("leaves a change with no receipt endpoint on the existing planning grammar", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const deps = dependencies(receipt);

    await expect(classifyDecompositionPlanningLane({
      changeSet: "known",
      changes: changeSet.changes.slice(0, -1),
    }, BASE, HEAD, deps)).resolves.toEqual({ outcome: "planning" });
    expect(deps.readReceipt).not.toHaveBeenCalled();
    expect(deps.assemble).not.toHaveBeenCalled();
  });

  it("admits one exact canonical receipt beside its planning transition", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const deps = dependencies(receipt);

    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, deps)).resolves.toEqual({
      outcome: "planning",
    });
    expect(deps.assemble).toHaveBeenCalledOnce();
    expect(deps.validateLanding).toHaveBeenCalledOnce();
  });

  it("reviews a receipt claim whose endpoint set omits part of the transition", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const deps = dependencies(receipt);

    await expect(classifyDecompositionPlanningLane({
      changeSet: "known",
      changes: changeSet.changes.slice(1),
    }, BASE, HEAD, deps)).resolves.toEqual({ outcome: "reviewed" });
    expect(deps.assemble).not.toHaveBeenCalled();
    expect(deps.validateCanonical).not.toHaveBeenCalled();
    expect(deps.validateLanding).not.toHaveBeenCalled();
  });

  it("refuses multiple, modified, or deleted receipt claims", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const receiptPath = changeSet.changes.at(-1)!.path;
    const secondPath = `${receiptPath.slice(0, -5)}f.json`;
    const deps = dependencies(receipt);

    await expect(classifyDecompositionPlanningLane({
      changeSet: "known",
      changes: [...changeSet.changes, change(secondPath)],
    }, BASE, HEAD, deps)).resolves.toMatchObject({ outcome: "invalid-retirement" });
    for (const status of ["modified", "deleted"] as const) {
      await expect(classifyDecompositionPlanningLane({
        changeSet: "known",
        changes: [...changeSet.changes.slice(0, -1), change(receiptPath, status)],
      }, BASE, HEAD, deps)).resolves.toEqual({
        outcome: "invalid-retirement",
        locus: receiptPath,
      });
    }
  });

  it("settles rider shape as reviewed before invoking either validator", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const deps = dependencies(receipt);

    await expect(classifyDecompositionPlanningLane({
      changeSet: "known",
      changes: [...changeSet.changes, change(".arc/active/meta-rider.md")],
    }, BASE, HEAD, deps)).resolves.toEqual({ outcome: "reviewed" });
    expect(deps.assemble).not.toHaveBeenCalled();
    expect(deps.validateCanonical).not.toHaveBeenCalled();
    expect(deps.validateLanding).not.toHaveBeenCalled();
  });

  it("reviews a namespace record that is not a decomposition receipt", async () => {
    const { changeSet, receipt } = exactChangeSet();

    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
      readReceipt: vi.fn(async () => ({ status: "not-decomposition" as const })),
    }))).resolves.toEqual({ outcome: "reviewed" });
  });

  it("maps unreadable evidence to reviewed and content disagreement to invalid", async () => {
    const { changeSet, receipt } = exactChangeSet();
    const receiptPath = changeSet.changes.at(-1)!.path;

    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
      readReceipt: vi.fn(async () => ({ status: "unreadable" as const })),
    }))).resolves.toEqual({ outcome: "reviewed" });
    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
      readReceipt: vi.fn(async () => ({ status: "malformed" as const })),
    }))).resolves.toEqual({ outcome: "invalid-retirement", locus: receiptPath });
    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
      validateCanonical: vi.fn(() => ({
        status: "mismatch" as const,
        mismatch: { kind: "path" as const, locus: ".arc/active/meta-origin.md" },
      })),
    }))).resolves.toEqual({
      outcome: "invalid-retirement",
      locus: ".arc/active/meta-origin.md",
    });
  });

  it("maps landing read failures to reviewed and landing disagreements to invalid", async () => {
    const { changeSet, receipt } = exactChangeSet();
    for (const mismatch of [
      { kind: "base" as const, locus: "unresolvable" },
      { kind: "base" as const, locus: "binding-unavailable" },
      {
        kind: "dependency" as const,
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
      {
        kind: "patch" as const,
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
    ]) {
      await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
        validateLanding: vi.fn(async () => ({ status: "refused" as const, mismatch })),
      }))).resolves.toEqual({ outcome: "reviewed" });
    }
    await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
      validateLanding: vi.fn(async () => ({
        status: "refused" as const,
        mismatch: { kind: "base" as const, locus: "regressed" },
      })),
    }))).resolves.toEqual({ outcome: "invalid-retirement", locus: "regressed" });

    for (const kind of ["path", "patch"] as const) {
      await expect(classifyDecompositionPlanningLane(changeSet, BASE, HEAD, dependencies(receipt, {
        validateLanding: vi.fn(async () => ({
          status: "refused" as const,
          mismatch: { kind, locus: "snapshot-read" },
        })),
      }))).resolves.toEqual({ outcome: "invalid-retirement", locus: "snapshot-read" });
    }
  });
});
