import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import type {
  DescendantBaseLandingDependencies,
  DescendantBaseLandingObjectReaders,
} from "../../../src/lib/work-unit/validate-descendant-base-landing.js";
import {
  validateBoundDescendantBaseLanding,
  validateDescendantBaseLanding,
} from "../../../src/lib/work-unit/validate-descendant-base-landing.js";
import { v3DecomposeReceiptPath } from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import type { V3DecomposeTreeSnapshot } from "../../../src/lib/work-unit/decompose-v3-preflight.js";
import { V3_DECOMPOSITION_READ_FAILURE } from "../../../src/lib/work-unit/validate-v3-decomposition.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const RECORDED_BASE = "b".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const DESCENDANT_BASE = "d".repeat(40);
const REGRESSED_BASE = "a".repeat(40);
const DIVERGENT_BASE = "e".repeat(40);
const BASE_REF = "refs/heads/main";
const CANDIDATE_REF = "refs/heads/decompose-candidate";

function harness(options: {
  ancestry?: ReadonlyArray<readonly [string, string]>;
  unresolvable?: string;
} = {}): DescendantBaseLandingDependencies {
  const ancestry = new Set((options.ancestry ?? []).map(([ancestor, descendant]) =>
    `${ancestor}\0${descendant}`));
  const objects: DescendantBaseLandingObjectReaders = {
    resolveCommit: async (ref) => ref === options.unresolvable ? null : ref,
    readAncestry: async (ancestor, descendant) => {
      if (ancestor === options.unresolvable || descendant === options.unresolvable) return "unresolvable";
      return ancestry.has(`${ancestor}\0${descendant}`) ? "ancestor" : "not-ancestor";
    },
    readTreeEntry: async () => false,
    stateMatches: async () => false,
    changedPaths: async () => null,
    readBlob: async () => {
      throw new Error("not used by relation validation");
    },
  };
  return {
    objects,
    dependencies: {
      readSnapshot: async () => {
        throw new Error("not used by relation validation");
      },
    },
  };
}

function input(currentBaseOid = RECORDED_BASE, candidateHeadOid = CANDIDATE_HEAD) {
  return {
    receipt: v3DecompositionEvidenceFixture().receipt,
    currentBaseOid,
    candidateHeadOid,
  };
}

interface ReplayHarnessOptions {
  changedPaths?: readonly string[];
  mismatchedStates?: ReadonlyArray<readonly [string, string]>;
  baseEdges?: V3DecomposeTreeSnapshot["incomingEdges"];
  currentEdges?: V3DecomposeTreeSnapshot["incomingEdges"];
  receiptAtPreparedBase?: boolean;
  candidateReceiptEntry?: "regular" | "wrong-mode" | "non-blob" | "missing" | "malformed";
  invalidReceiptBytes?: boolean;
  snapshotThrows?: boolean;
}

function replayHarness(options: ReplayHarnessOptions = {}) {
  const fixture = v3DecompositionEvidenceFixture();
  const receipt = fixture.receipt;
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const projectionPath = receipt.prepared.prospectiveProjection.roadmap.path;
  const semanticPath = receipt.finalized.transitionPatch.find(({ path }) => path !== projectionPath)?.path;
  if (semanticPath === undefined) throw new Error("fixture has no semantic transition path");
  const mismatchedStates = new Set((options.mismatchedStates ?? []).map(([ref, path]) => `${ref}\0${path}`));
  const stateCalls: string[] = [];
  const snapshotCalls: string[] = [];
  const receiptOid = "f".repeat(40);
  const expectedPaths = [
    ...receipt.finalized.transitionPatch.map(({ path }) => path),
    receiptPath,
  ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  const deps = harness({ ancestry: [[RECORDED_BASE, DESCENDANT_BASE]] });
  deps.objects.stateMatches = async (ref, path) => {
    stateCalls.push(`${ref}\0${path}`);
    return !mismatchedStates.has(`${ref}\0${path}`);
  };
  deps.objects.changedPaths = async () => [...(options.changedPaths ?? expectedPaths)];
  deps.objects.readTreeEntry = async (ref, path) => {
    if (path !== receiptPath) return false;
    if (ref === RECORDED_BASE) {
      return options.receiptAtPreparedBase ? { mode: "100644", type: "blob", oid: receiptOid } : null;
    }
    if (ref !== CANDIDATE_HEAD || options.candidateReceiptEntry === "missing") return null;
    if (options.candidateReceiptEntry === "malformed") return false;
    return {
      mode: options.candidateReceiptEntry === "wrong-mode" ? "100755" : "100644",
      type: options.candidateReceiptEntry === "non-blob" ? "commit" : "blob",
      oid: receiptOid,
    };
  };
  deps.objects.readBlob = async (oid) => {
    if (oid !== receiptOid) throw new Error("unexpected blob");
    return new TextEncoder().encode(options.invalidReceiptBytes ? "{}" : canonicalize(receipt));
  };
  deps.dependencies.readSnapshot = async (ref, head, origin) => {
    snapshotCalls.push(`${ref}\0${head}\0${origin}`);
    if (options.snapshotThrows) throw new Error("malformed tree snapshot");
    return {
      ref,
      head,
      origins: [],
      sourceArtifacts: [],
      incomingEdges: head === RECORDED_BASE ? options.baseEdges ?? [] : options.currentEdges ?? [],
      outgoingEdges: [],
    };
  };
  return { deps, receipt, receiptPath, projectionPath, semanticPath, stateCalls, snapshotCalls };
}

function bindingHarness(options: {
  baseReread?: string | null;
  candidateReread?: string | null;
  replay?: ReplayHarnessOptions;
} = {}) {
  const h = replayHarness(options.replay);
  const refReads = new Map<string, number>();
  const originalResolve = h.deps.objects.resolveCommit;
  h.deps.objects.resolveCommit = async (ref) => {
    if (ref !== BASE_REF && ref !== CANDIDATE_REF) return originalResolve(ref);
    const read = (refReads.get(ref) ?? 0) + 1;
    refReads.set(ref, read);
    if (ref === BASE_REF) {
      return read === 1
        ? DESCENDANT_BASE
        : "baseReread" in options ? options.baseReread ?? null : DESCENDANT_BASE;
    }
    return read === 1
      ? CANDIDATE_HEAD
      : "candidateReread" in options ? options.candidateReread ?? null : CANDIDATE_HEAD;
  };
  return { ...h, refReads };
}

describe("validateDescendantBaseLanding", () => {
  it("admits the exact recorded result base", async () => {
    await expect(validateDescendantBaseLanding(input(), replayHarness().deps)).resolves.toEqual({
      status: "admitted",
      binding: { currentBaseOid: RECORDED_BASE, candidateHeadOid: CANDIDATE_HEAD },
    });
  });

  it("admits a strict descendant of the recorded result base", async () => {
    const deps = replayHarness().deps;
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), deps)).resolves.toEqual({
      status: "admitted",
      binding: { currentBaseOid: DESCENDANT_BASE, candidateHeadOid: CANDIDATE_HEAD },
    });
  });

  it.each([
    [REGRESSED_BASE, [[REGRESSED_BASE, RECORDED_BASE]], "regressed"],
    [DIVERGENT_BASE, [], "divergent"],
  ] as const)("refuses a non-descendant base as %s", async (currentBaseOid, ancestry, locus) => {
    await expect(validateDescendantBaseLanding(input(currentBaseOid), harness({ ancestry }))).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus },
    });
  });

  it("refuses malformed or mixed-width object ids", async () => {
    await expect(validateDescendantBaseLanding(input("not-an-oid"), harness())).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "object-format" },
    });
    await expect(validateDescendantBaseLanding(input(RECORDED_BASE, "c".repeat(64)), harness())).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "object-format" },
    });
  });

  it("refuses an unresolvable exact object", async () => {
    await expect(validateDescendantBaseLanding(
      input(DESCENDANT_BASE),
      harness({ unresolvable: DESCENDANT_BASE }),
    )).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "unresolvable" },
    });
  });

  it("refuses a receipt that does not decode as canonical v3", async () => {
    await expect(validateDescendantBaseLanding(
      { ...input(), receipt: {} },
      harness(),
    )).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "receipt" },
    });
  });

  it("admits unrelated movement while replaying semantic paths against the moved base", async () => {
    const h = replayHarness();
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toMatchObject({
      status: "admitted",
    });
    expect(h.stateCalls).toContain(`${DESCENDANT_BASE}\0${h.semanticPath}`);
    expect(h.stateCalls).toContain(`${CANDIDATE_HEAD}\0${h.semanticPath}`);
  });

  it("excludes the regenerable projection from moved-base overlap", async () => {
    const h = replayHarness({ mismatchedStates: [[DESCENDANT_BASE, ".arc/backlog/ROADMAP.md"]] });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toMatchObject({
      status: "admitted",
    });
    expect(h.stateCalls).not.toContain(`${DESCENDANT_BASE}\0${h.projectionPath}`);
  });

  it("refuses any semantic-path state mismatch at the moved base", async () => {
    const h = replayHarness({ mismatchedStates: [[DESCENDANT_BASE, ".arc/backlog/planned/origin/cohort-origin.md"]] });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "path", locus: h.semanticPath },
    });
  });

  it("refuses a candidate after-state that no longer matches the recorded transition", async () => {
    const h = replayHarness({ mismatchedStates: [[CANDIDATE_HEAD, ".arc/backlog/planned/origin/cohort-origin.md"]] });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "patch", locus: h.semanticPath },
    });
  });

  it("admits the candidate's own canonical receipt blob in the transition diff", async () => {
    const h = replayHarness();
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toMatchObject({
      status: "admitted",
    });
  });

  it.each([
    ["an extra transition path", { changedPaths: [".arc/foreign.md"] }],
    ["a pre-existing receipt", { receiptAtPreparedBase: true }],
    ["a missing candidate receipt", { candidateReceiptEntry: "missing" }],
    ["a mode-changed candidate receipt", { candidateReceiptEntry: "wrong-mode" }],
    ["a non-blob candidate receipt", { candidateReceiptEntry: "non-blob" }],
    ["an unreadable candidate receipt entry", { candidateReceiptEntry: "malformed" }],
    ["noncanonical candidate receipt bytes", { invalidReceiptBytes: true }],
  ] as const)("refuses %s", async (caseName, options) => {
    const h = replayHarness(options);
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: {
        kind: "patch",
        locus: caseName === "an extra transition path"
          ? ".arc/foreign.md"
          : caseName === "an unreadable candidate receipt entry"
          ? "snapshot-read"
          : h.receiptPath,
        ...(caseName === "an unreadable candidate receipt entry"
          ? { evidence: V3_DECOMPOSITION_READ_FAILURE }
          : {}),
      },
    });
  });

  it("preserves an unreadable transition diff as a read-shaped refusal", async () => {
    const h = replayHarness();
    h.deps.objects.changedPaths = async () => null;

    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: {
        kind: "patch",
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
    });
  });

  it("preserves unreadable transition path state as a read-shaped refusal", async () => {
    const h = replayHarness();
    h.deps.objects.stateMatches = async (_ref, path) => path === h.projectionPath ? true : null;

    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: {
        kind: "path",
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
    });
  });

  it("preserves an unreadable receipt blob as a read-shaped refusal", async () => {
    const h = replayHarness();
    h.deps.objects.readBlob = async () => {
      throw new Error("blob unavailable");
    };

    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: {
        kind: "patch",
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
    });
  });

  it("refuses a dependency on the retired origin acquired by the moved base", async () => {
    const h = replayHarness({
      currentEdges: [{ dependent: "new-consumer", currentTargets: ["origin"] }],
    });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "dependency", locus: "new-consumer" },
    });
  });

  it.each([
    ["an unchanged origin dependency", [{ dependent: "consumer", currentTargets: ["origin"] }],
      [{ dependent: "consumer", currentTargets: ["origin"] }]],
    ["unrelated dependency changes", [{ dependent: "consumer", currentTargets: ["origin"] }],
      [{ dependent: "consumer", currentTargets: ["origin", "other"] }]],
    ["source-branch receipt edges that differ from the base", [], []],
  ] as const)("admits %s", async (_case, baseEdges, currentEdges) => {
    const h = replayHarness({ baseEdges, currentEdges });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toMatchObject({
      status: "admitted",
    });
    expect(h.snapshotCalls).toEqual([
      `refs/heads/main\0${RECORDED_BASE}\0origin`,
      `refs/heads/main\0${DESCENDANT_BASE}\0origin`,
    ]);
  });

  it("converts a thrown dependency reader failure into a typed refusal", async () => {
    const h = replayHarness({ snapshotThrows: true });
    await expect(validateDescendantBaseLanding(input(DESCENDANT_BASE), h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: {
        kind: "dependency",
        locus: "snapshot-read",
        evidence: V3_DECOMPOSITION_READ_FAILURE,
      },
    });
  });

  it("returns the pinned verdict when both refs are unchanged across validation", async () => {
    const h = bindingHarness();
    await expect(validateBoundDescendantBaseLanding({
      receipt: h.receipt,
      currentBaseRef: BASE_REF,
      candidateHeadRef: CANDIDATE_REF,
    }, h.deps)).resolves.toEqual({
      status: "admitted",
      binding: { currentBaseOid: DESCENDANT_BASE, candidateHeadOid: CANDIDATE_HEAD },
    });
    expect(h.refReads).toEqual(new Map([[BASE_REF, 2], [CANDIDATE_REF, 2]]));
  });

  it("returns an underlying typed refusal when the bound refs stay unchanged", async () => {
    const h = bindingHarness({
      replay: { mismatchedStates: [[DESCENDANT_BASE, ".arc/backlog/planned/origin/cohort-origin.md"]] },
    });
    await expect(validateBoundDescendantBaseLanding({
      receipt: h.receipt,
      currentBaseRef: BASE_REF,
      candidateHeadRef: CANDIDATE_REF,
    }, h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "path", locus: h.semanticPath },
    });
    expect(h.refReads).toEqual(new Map([[BASE_REF, 2], [CANDIDATE_REF, 2]]));
  });

  it("lets a raced binding dominate a verdict computed inside the stale window", async () => {
    const h = bindingHarness({
      baseReread: "1".repeat(40),
      replay: { mismatchedStates: [[DESCENDANT_BASE, ".arc/backlog/planned/origin/cohort-origin.md"]] },
    });
    await expect(validateBoundDescendantBaseLanding({
      receipt: h.receipt,
      currentBaseRef: BASE_REF,
      candidateHeadRef: CANDIDATE_REF,
    }, h.deps)).resolves.toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "binding-unavailable" },
    });
    expect(h.refReads).toEqual(new Map([[BASE_REF, 2], [CANDIDATE_REF, 2]]));
  });

  it.each([
    ["configured base", "1".repeat(40), CANDIDATE_HEAD],
    ["candidate head", DESCENDANT_BASE, "2".repeat(40)],
    ["both refs", "1".repeat(40), "2".repeat(40)],
    ["unresolvable base", null, CANDIDATE_HEAD],
    ["unresolvable candidate", DESCENDANT_BASE, null],
  ] as const)("refuses when the %s moves or disappears during validation", async (
    caseName,
    baseReread,
    candidateReread,
  ) => {
    const h = bindingHarness({ baseReread, candidateReread });
    const result = await validateBoundDescendantBaseLanding({
      receipt: h.receipt,
      currentBaseRef: BASE_REF,
      candidateHeadRef: CANDIDATE_REF,
    }, h.deps);
    expect(result, caseName).toEqual({
      status: "refused",
      mismatch: { kind: "base", locus: "binding-unavailable" },
    });
    expect(h.refReads).toEqual(new Map([[BASE_REF, 2], [CANDIDATE_REF, 2]]));
    expect(Object.keys(result)).not.toContain("recovery");
    expect(JSON.stringify(result)).not.toMatch(/action|command|remedy/u);
  });
});
