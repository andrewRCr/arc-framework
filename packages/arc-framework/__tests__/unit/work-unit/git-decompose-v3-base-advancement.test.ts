import { describe, expect, it, vi } from "vitest";

import {
  canonicalize,
  digestBytes,
  type CanonicalDigest,
} from "../../../src/lib/canonical/canonical-json.js";
import {
  decomposeCandidateBranch,
  decomposeTransientClaimId,
  restateDecomposeTransientClaimBinding,
  type DecomposeTransientClaim,
} from "../../../src/lib/work-unit/decompose-transient-claim.js";
import type { DecomposeTransientClaimStore } from "../../../src/lib/work-unit/decompose-transient-claim-store.js";
import {
  v3CandidateWorktreeId,
  v3DecomposeReceiptPath,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import {
  prepareGitV3DecomposeBaseAdvancement,
  advanceGitV3DecomposeBase,
  type GitV3DecomposeBaseAdvancementDependencies,
} from "../../../src/lib/work-unit/git-decompose-v3-base-advancement.js";
import type { GitV3RepositoryPlanResult } from
  "../../../src/lib/work-unit/git-decompose-v3-repository-plan.js";
import { parseV3DecomposeReceipt } from
  "../../../src/lib/work-unit/decompose-v3-receipt.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

const ORIGIN = "origin";
const BASE_REF = "main";
const RECORDED_BASE = "b".repeat(40);
const CURRENT_BASE = "f".repeat(40);
const CANDIDATE_HEAD = "c".repeat(40);
const CANDIDATE_PATH = "/repo-candidate";
const CANDIDATE_BRANCH = decomposeCandidateBranch(ORIGIN);
const CLAIM_ID = decomposeTransientClaimId({ origin: ORIGIN, candidateBranch: CANDIDATE_BRANCH });
const WORKTREE_ID = v3CandidateWorktreeId(CLAIM_ID, 1);

function fixture(resultBaseHead = RECORDED_BASE, sourceOnBase = false) {
  return v3DecompositionEvidenceFixture({
    resultBaseHead,
    ...(sourceOnBase
      ? { sourceRef: "refs/heads/main", sourceLogicalBranch: "main" }
      : {}),
    candidateOwnership: {
      kind: "claimed",
      protection: "full",
      claimId: CLAIM_ID,
      generation: 1,
      candidateBranch: CANDIDATE_BRANCH,
      candidateWorktree: WORKTREE_ID,
    },
  });
}

function claim(receipt = fixture().receipt): DecomposeTransientClaim {
  return {
    schemaVersion: 1,
    kind: "decomposition-candidate",
    claimId: CLAIM_ID,
    generation: 1,
    binding: {
      origin: ORIGIN,
      candidateBranch: CANDIDATE_BRANCH,
      sourceHead: receipt.prepared.completedMap.machine.source.head,
      resultBaseHead: receipt.prepared.completedMap.machine.resultBase.head,
      cutMapDigest: receipt.prepared.cutMapDigest,
    },
    candidateWorktree: WORKTREE_ID,
    state: { kind: "occupied" },
    registration: { kind: "registered", path: CANDIDATE_PATH },
  };
}

function claimStore(value: DecomposeTransientClaim): DecomposeTransientClaimStore {
  return {
    read: async () => ({ status: "found", claim: value }),
  } as unknown as DecomposeTransientClaimStore;
}

function sourceInventory(receipt = fixture().receipt) {
  return receipt.prepared.completedMap.machine.sourceUnits.map((unit) => ({
    path: unit.sourcePath,
    objectKind: "blob" as const,
    mode: "100644" as const,
    contentDigest: unit.contentDigest,
  }));
}

function harness(options: {
  receipt?: ReturnType<typeof fixture>["receipt"] | null;
  claim?: DecomposeTransientClaim;
  dirty?: boolean;
  landed?: boolean;
  baseHead?: string;
  landing?: Awaited<ReturnType<NonNullable<GitV3DecomposeBaseAdvancementDependencies["validateLanding"]>>>;
  canonicalInventory?: ReturnType<typeof sourceInventory>;
  rederive?: GitV3DecomposeBaseAdvancementDependencies["rederive"];
} = {}) {
  const receipt = options.receipt === undefined ? fixture().receipt : options.receipt;
  const baseHead = options.baseHead ?? CURRENT_BASE;
  const calls: Array<{ args: string[]; cwd?: string }> = [];
  const exec: GitV3DecomposeBaseAdvancementDependencies["exec"] = async (_command, args, invocation) => {
    calls.push({ args, ...(invocation?.cwd === undefined ? {} : { cwd: invocation.cwd }) });
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const ref = args[2]?.replace(/\^\{commit\}$/u, "") ?? "";
      if (ref === "HEAD" && invocation?.cwd === CANDIDATE_PATH) return { stdout: `${CANDIDATE_HEAD}\n` };
      if (ref === CANDIDATE_BRANCH || ref === CANDIDATE_HEAD) return { stdout: `${CANDIDATE_HEAD}\n` };
      if (ref === BASE_REF || ref === baseHead) return { stdout: `${baseHead}\n` };
      return { stdout: "" };
    }
    if (args[0] === "symbolic-ref") return { stdout: `${CANDIDATE_BRANCH}\n` };
    if (args[0] === "status") return { stdout: options.dirty === true ? " M file\0" : "" };
    if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
      if (options.landed === true) return { stdout: "" };
      throw Object.assign(new Error("not ancestor"), { exitCode: 1 });
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
  const advanced = fixture(baseHead);
  const rederive = options.rederive ?? (async () => ({
    preparation: advanced.preparation,
    plan: {
      status: "composed" as const,
      plan: {} as never,
      blobs: [],
      sourceArtifactInventory: sourceInventory(advanced.receipt),
    },
  }));
  const dependencies: GitV3DecomposeBaseAdvancementDependencies = {
    cwd: "/repo",
    exec,
    readBlob: async () => receipt === null
      ? null
      : new TextEncoder().encode(canonicalize(receipt)),
    readObject: async () => new Uint8Array(),
    cohortTemplate: new Uint8Array(),
    claimStore: claimStore(options.claim ?? claim(receipt ?? fixture().receipt)),
    createPreflight: async () => ({
      status: "ready",
      preflight: {
        sourceArtifactInventory: options.canonicalInventory ?? sourceInventory(receipt ?? fixture().receipt),
      },
    } as never),
    validateLanding: async () => options.landing ?? {
      status: "admitted",
      binding: { currentBaseOid: baseHead, candidateHeadOid: CANDIDATE_HEAD },
    },
    rederive,
  };
  return { dependencies, calls, receipt, baseHead };
}

const encoder = new TextEncoder();

function labelBytes(label: string): Uint8Array {
  return encoder.encode(canonicalize(label));
}

function advancedPlan() {
  const advanced = fixture(CURRENT_BASE);
  const afterBytes = new Map([
    [digestBytes(labelBytes("roadmap after")), labelBytes("roadmap after")],
    [digestBytes(labelBytes("cohort topology")), labelBytes("cohort topology")],
    [digestBytes(labelBytes("result 0")), labelBytes("result 0")],
    [digestBytes(labelBytes("result 1")), labelBytes("result 1")],
  ]);
  const mutations = advanced.receipt.finalized.managedPathResults.map(({ path, before, after }) => ({
    kind: "exclusive" as const,
    role: path === advanced.preparation.facts.prospectiveProjection.roadmap.path
      ? "roadmap" as const
      : "receipt-evidence" as const,
    path,
    before,
    after,
  }));
  const plan = {
    planId: advanced.preparation.facts.prospectiveProjection.overlay.planId,
    cutMapDigest: advanced.preparation.facts.cutMapDigest,
    sourceHead: advanced.preparation.facts.completedMap.machine.source.head,
    expectedBaseHead: CURRENT_BASE,
    candidateAuthority: {
      candidatePublication: advanced.preparation.facts.candidatePublication,
      topology: advanced.preparation.facts.topology,
    },
    allowedPaths: advanced.preparation.facts.allowedPaths,
    allowedPathsDigest: advanced.preparation.facts.allowedPathsDigest,
    prospectiveOverlay: advanced.preparation.facts.prospectiveProjection.overlay,
    roadmap: advanced.preparation.facts.prospectiveProjection.roadmap,
    mutations,
  } as Extract<GitV3RepositoryPlanResult, { status: "composed" }>["plan"];
  return {
    advanced,
    composed: {
      status: "composed" as const,
      plan,
      blobs: [...afterBytes.entries()].map(([contentDigest, bytes]) => ({ contentDigest, bytes })),
      sourceArtifactInventory: sourceInventory(advanced.receipt),
    },
    afterBytes,
  };
}

function mutationHarness(options: {
  conflictPath?: string;
  tamperPath?: string;
  claimRefusal?: boolean;
  claimThrow?: boolean;
} = {}) {
  const planned = advancedPlan();
  let liveClaim = claim();
  let mergeActive = false;
  let restored = false;
  const staged = new Map<string, Uint8Array>();
  const objects = new Map<string, Uint8Array>();
  const pending = new Map<string, Uint8Array>();
  let oidCounter = 1;
  const storeObject = (bytes: Uint8Array): string => {
    const oid = (oidCounter++).toString(16).padStart(40, "0");
    objects.set(oid, bytes);
    return oid;
  };
  const oldReceiptBytes = encoder.encode(canonicalize(fixture().receipt));
  const receiptPath = v3DecomposeReceiptPath(fixture().receipt.receiptId);
  staged.set(receiptPath, oldReceiptBytes);
  for (const result of planned.advanced.receipt.finalized.managedPathResults) {
    if (result.after.kind !== "file") continue;
    const bytes = planned.afterBytes.get(result.after.contentDigest);
    if (bytes === undefined) throw new Error(`missing bytes for ${result.path}`);
    staged.set(result.path, bytes);
  }
  if (options.tamperPath !== undefined) staged.set(options.tamperPath, labelBytes("tampered"));

  const claimStoreValue: DecomposeTransientClaimStore = {
    read: async () => ({ status: "found", claim: liveClaim }),
    restateBinding: async (
      claimId: CanonicalDigest,
      generation: number,
      expected: DecomposeTransientClaim["binding"],
      next: Pick<DecomposeTransientClaim["binding"], "resultBaseHead" | "cutMapDigest">,
    ) => {
      if (options.claimThrow === true) throw new Error("claim store interrupted");
      if (options.claimRefusal === true) return { status: "conflict", reason: "binding-mismatch" };
      const result = restateDecomposeTransientClaimBinding(
        liveClaim,
        claimId,
        generation,
        expected,
        next,
      );
      if (result.status === "restated") liveClaim = result.claim;
      return result;
    },
  } as unknown as DecomposeTransientClaimStore;

  const exec: GitV3DecomposeBaseAdvancementDependencies["exec"] = async (_command, args, invocation) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const ref = args[2]?.replace(/\^\{commit\}$/u, "") ?? "";
      if (ref === "MERGE_HEAD") {
        if (!mergeActive) throw Object.assign(new Error("no merge"), { exitCode: 128 });
        return { stdout: `${CURRENT_BASE}\n` };
      }
      if (ref === "HEAD" && invocation?.cwd === CANDIDATE_PATH) return { stdout: `${CANDIDATE_HEAD}\n` };
      if (ref === CANDIDATE_BRANCH || ref === CANDIDATE_HEAD) return { stdout: `${CANDIDATE_HEAD}\n` };
      if (ref === BASE_REF || ref === CURRENT_BASE) return { stdout: `${CURRENT_BASE}\n` };
      return { stdout: "" };
    }
    if (args[0] === "symbolic-ref") return { stdout: `${CANDIDATE_BRANCH}\n` };
    if (args[0] === "status") return { stdout: mergeActive ? " M merge\0" : "" };
    if (args[0] === "merge-base") throw Object.assign(new Error("not ancestor"), { exitCode: 1 });
    if (args[0] === "merge" && args[1] === "--no-commit") {
      mergeActive = true;
      if (options.conflictPath !== undefined) {
        throw Object.assign(new Error("merge conflict"), { exitCode: 1 });
      }
      return { stdout: "" };
    }
    if (args[0] === "merge" && args[1] === "--abort") {
      mergeActive = false;
      return { stdout: "" };
    }
    if (args[0] === "reset" && args[1] === "--hard") {
      mergeActive = false;
      restored = true;
      return { stdout: "" };
    }
    if (args[0] === "diff" && args[1] === "--name-only") {
      return { stdout: options.conflictPath === undefined ? "" : `${options.conflictPath}\0` };
    }
    if (args[0] === "ls-files") {
      const path = args.at(-1) ?? "";
      const bytes = staged.get(path);
      if (bytes === undefined) return { stdout: "" };
      const oid = storeObject(bytes);
      return { stdout: `100644 ${oid} 0\t${path}\0` };
    }
    if (args[0] === "ls-tree") {
      const path = (args.at(-1) ?? "").replace(/^:\(literal\)/u, "");
      const before = planned.advanced.receipt.finalized.managedPathResults
        .find((result) => result.path === path)?.before;
      if (before?.kind !== "file") return { stdout: "" };
      const bytes = labelBytes("roadmap before");
      const oid = storeObject(bytes);
      return { stdout: `100644 blob ${oid}\t${path}\0` };
    }
    if (args[0] === "add") {
      const path = args.at(-1) ?? "";
      const bytes = pending.get(path);
      if (bytes === undefined) throw new Error(`nothing written for ${path}`);
      staged.set(path, bytes);
      pending.delete(path);
      return { stdout: "" };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
  const dependencies: GitV3DecomposeBaseAdvancementDependencies = {
    cwd: "/repo",
    exec,
    readBlob: async () => oldReceiptBytes,
    readObject: async (oid) => objects.get(oid) ?? new Uint8Array(),
    cohortTemplate: new Uint8Array(),
    claimStore: claimStoreValue,
    createPreflight: async () => ({
      status: "ready",
      preflight: { sourceArtifactInventory: sourceInventory() },
    } as never),
    validateLanding: async () => ({
      status: "admitted",
      binding: { currentBaseOid: CURRENT_BASE, candidateHeadOid: CANDIDATE_HEAD },
    }),
    rederive: async () => ({
      preparation: planned.advanced.preparation,
      plan: planned.composed,
    }),
    writeCandidateFile: async (_cwd, path, bytes) => {
      pending.set(path, new Uint8Array(bytes));
    },
  };
  return {
    dependencies,
    receiptPath,
    staged,
    claim: () => liveClaim,
    mergeActive: () => mergeActive,
    restored: () => restored,
  };
}

const input = (overrides: Partial<{
  protection: "full" | "partial";
  receiptId: string;
}> = {}) => ({
  protection: "full" as const,
  baseBranch: BASE_REF,
  origin: ORIGIN,
  receiptId: fixture().receipt.receiptId,
  ...overrides,
});

describe("prepareGitV3DecomposeBaseAdvancement", () => {
  it("refuses partial protection and malformed receipt ids before repository reads", async () => {
    const partial = harness();
    expect(await prepareGitV3DecomposeBaseAdvancement(
      partial.dependencies,
      input({ protection: "partial" }),
    )).toMatchObject({ status: "refused", reason: "full-protection-required" });
    expect(partial.calls).toEqual([]);

    const malformed = harness();
    expect(await prepareGitV3DecomposeBaseAdvancement(
      malformed.dependencies,
      input({ receiptId: "not-a-receipt" }),
    )).toMatchObject({ status: "refused", reason: "receipt-id-invalid" });
    expect(malformed.calls).toEqual([]);
  });

  it("admits a clean committed-unlanded candidate and re-derives before any mutation", async () => {
    const h = harness();
    const result = await prepareGitV3DecomposeBaseAdvancement(h.dependencies, input());

    expect(result.status).toBe("admitted");
    if (result.status !== "admitted") return;
    expect(result).toMatchObject({
      candidatePath: CANDIDATE_PATH,
      candidateHead: CANDIDATE_HEAD,
      previousBaseHead: RECORDED_BASE,
      currentBaseHead: CURRENT_BASE,
      preparation: {
        receiptId: h.receipt?.receiptId,
        facts: { completedMap: { machine: { resultBase: { head: CURRENT_BASE } } } },
      },
    });
    expect(result.preparation.preparationId).not.toBe(result.receipt.preparationId);
    expect(h.calls.some(({ args }) => ["merge", "reset", "restore", "add"].includes(args[0] ?? "")))
      .toBe(false);
  });

  it("returns unchanged when the receipt already names the live base", async () => {
    const exact = fixture(CURRENT_BASE);
    const h = harness({ receipt: exact.receipt, claim: claim(exact.receipt) });
    expect(await prepareGitV3DecomposeBaseAdvancement(
      h.dependencies,
      input({ receiptId: exact.receipt.receiptId }),
    )).toMatchObject({
      status: "unchanged",
      currentBaseHead: CURRENT_BASE,
      candidateHead: CANDIDATE_HEAD,
    });
  });

  it.each([
    ["dirty candidate", { dirty: true }, "candidate-dirty"],
    ["landed candidate", { landed: true }, "candidate-already-landed"],
    ["missing receipt", { receipt: null }, "receipt-unavailable"],
  ] as const)("refuses a %s without mutation", async (_label, options, reason) => {
    const h = harness(options);
    expect(await prepareGitV3DecomposeBaseAdvancement(h.dependencies, input()))
      .toMatchObject({ status: "refused", reason });
    expect(h.calls.some(({ args }) => ["merge", "reset", "restore", "add"].includes(args[0] ?? "")))
      .toBe(false);
  });

  it("refuses a foreign or superseded candidate generation", async () => {
    const foreign = claim();
    foreign.generation = 2;
    const h = harness({ claim: foreign });
    expect(await prepareGitV3DecomposeBaseAdvancement(h.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "candidate-generation-mismatch" });
  });

  it("refuses the structural source-ref/result-base equality precondition", async () => {
    const sameRef = fixture(RECORDED_BASE, true);
    const h = harness({ receipt: sameRef.receipt, claim: claim(sameRef.receipt) });
    expect(await prepareGitV3DecomposeBaseAdvancement(
      h.dependencies,
      input({ receiptId: sameRef.receipt.receiptId }),
    )).toMatchObject({ status: "refused", reason: "source-ref-is-result-base" });
  });

  it("carries the landing validator mismatch unchanged", async () => {
    const h = harness({
      landing: { status: "refused", mismatch: { kind: "path", locus: ".arc/active/meta-origin.md" } },
    });
    expect(await prepareGitV3DecomposeBaseAdvancement(h.dependencies, input())).toEqual({
      status: "refused",
      reason: "landing-validation-refused",
      remedy: "Resolve the reported base overlap before retrying advancement.",
      mismatch: { kind: "path", locus: ".arc/active/meta-origin.md" },
    });
  });

  it("refuses canonical validation and re-derivation before mutation", async () => {
    const invalid = harness({ canonicalInventory: [] });
    expect(await prepareGitV3DecomposeBaseAdvancement(invalid.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "canonical-validation-refused" });

    const rederive = vi.fn(async () => null);
    const refused = harness({ rederive });
    expect(await prepareGitV3DecomposeBaseAdvancement(refused.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "advancement-rederivation-refused" });
    expect(rederive).toHaveBeenCalledOnce();
    expect(refused.calls.some(({ args }) => ["merge", "reset", "restore", "add"].includes(args[0] ?? "")))
      .toBe(false);
  });
});

describe("advanceGitV3DecomposeBase", () => {
  it("merges the pinned base, seals the same receipt path, and restates the claim", async () => {
    const h = mutationHarness();
    const result = await advanceGitV3DecomposeBase(h.dependencies, input());
    expect(result).toMatchObject({
      status: "advanced",
      receiptId: fixture().receipt.receiptId,
      previousBaseHead: RECORDED_BASE,
      currentBaseHead: CURRENT_BASE,
    });
    const receipt = parseV3DecomposeReceipt(
      new TextDecoder().decode(h.staged.get(h.receiptPath)),
    );
    expect(receipt).not.toBeNull();
    expect(receipt?.prepared.completedMap.machine.resultBase.head).toBe(CURRENT_BASE);
    expect(receipt?.receiptId).toBe(fixture().receipt.receiptId);
    expect(h.claim().binding).toMatchObject({
      resultBaseHead: CURRENT_BASE,
      cutMapDigest: receipt?.prepared.cutMapDigest,
    });
    expect(h.mergeActive()).toBe(true);
    expect(h.restored()).toBe(false);
  });

  it("restores the pinned candidate after an unexpected non-projection conflict", async () => {
    const h = mutationHarness({ conflictPath: ".arc/active/meta-origin.md" });
    expect(await advanceGitV3DecomposeBase(h.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "merge-refused" });
    expect(h.mergeActive()).toBe(false);
    expect(h.restored()).toBe(true);
    expect(h.claim().binding.resultBaseHead).toBe(RECORDED_BASE);
  });

  it("restores the pinned candidate when a merged path differs from the re-composed plan", async () => {
    const tamperPath = fixture().receipt.finalized.managedPathResults
      .find(({ path }) => path.includes("member-a/meta-member-a"))?.path;
    if (tamperPath === undefined) throw new Error("expected result path");
    const h = mutationHarness({ tamperPath });
    expect(await advanceGitV3DecomposeBase(h.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "receipt-seal-refused" });
    expect(h.mergeActive()).toBe(false);
    expect(h.restored()).toBe(true);
    expect(h.claim().binding.resultBaseHead).toBe(RECORDED_BASE);
  });

  it("restores the pinned candidate when claim persistence is interrupted", async () => {
    const h = mutationHarness({ claimThrow: true });
    expect(await advanceGitV3DecomposeBase(h.dependencies, input()))
      .toMatchObject({ status: "refused", reason: "claim-binding-refused" });
    expect(h.mergeActive()).toBe(false);
    expect(h.restored()).toBe(true);
    expect(h.claim().binding.resultBaseHead).toBe(RECORDED_BASE);
  });
});
