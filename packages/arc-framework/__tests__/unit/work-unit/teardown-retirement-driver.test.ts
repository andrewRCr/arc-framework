import { describe, expect, it } from "vitest";

import { renderMetaProjectionFile } from "../../../src/lib/active/meta-reader.js";
import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import type { ManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import { artifactGroupDigest, preparationId } from "../../../src/lib/canonical/receipt-id.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeHuskStamp } from "../../../src/lib/git/worktree-marker.js";
import {
  createGitRetirementAuthorizationContext,
  readCompletedProjectionDigest,
} from "../../../src/lib/work-unit/git-retirement-authorization-context.js";
import {
  decomposeInventoryDigests,
  deriveDecomposeInventories,
} from "../../../src/lib/work-unit/decompose-inventory.js";
import { buildLifecycleIndexFromMetas } from "../../../src/lib/work-unit/lifecycle-index.js";
import {
  revalidateHuskRetirementEvidence,
  type TeardownBlobReader,
} from "../../../src/lib/work-unit/teardown-retirement-driver.js";
import type {
  RetirementReceipt,
  TeardownAuthorizationDecision,
} from "../../../src/lib/work-unit/retirement-authority.js";

const baseOid = "b".repeat(40);
const branch = "feat/sample";
const metaPath = ".arc/completed/2026-q3/01_sample/meta-sample.md";
const specPath = ".arc/completed/2026-q3/01_sample/spec-sample.md";
const meta = renderMetaProjectionFile("sample", { State: "Shipped", Branch: "[none]" });
const blobs = new Map<string, Uint8Array>([
  [metaPath, new TextEncoder().encode(meta)],
  [specPath, new TextEncoder().encode("# Sample\n")],
]);

function execWithCompletedProjection(options: { ancestry?: boolean; includeProjection?: boolean } = {}): GitExec {
  const ancestry = options.ancestry ?? true;
  const includeProjection = options.includeProjection ?? true;
  return async (_cmd, args) => {
    if (args[0] === "merge-base") {
      if (!ancestry) throw new Error("not ancestor");
      return { stdout: "" };
    }
    if (args[0] === "ls-tree") {
      return { stdout: includeProjection ? `${metaPath}\0${specPath}\0` : "" };
    }
    if (args[0] === "show" && (args[1] === `main:${metaPath}` || args[1] === `${baseOid}:${metaPath}`)) {
      return { stdout: meta };
    }
    if (args[0] === "rev-parse" && args.includes("origin/feat/sample")) throw new Error("no upstream");
    if (args[0] === "rev-parse") return { stdout: `${baseOid}\n` };
    if (args[0] === "cherry") return { stdout: "" };
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

const readBlob: TeardownBlobReader = async (_ref, path: ManagedPath) => blobs.get(path) ?? null;

const stamp: WorktreeHuskStamp = {
  sha: "a".repeat(40),
  at: "2026-07-16T00:00:00.000Z",
  subject: { kind: "work-unit", name: "sample" },
  branch,
};

function proof(resultDigest: `sha256:${string}`): Extract<TeardownAuthorizationDecision, { status: "authorized" }> {
  return {
    status: "authorized",
    authorization: "merged-preserved",
    authorityVersion: "version",
    evidence: {
      kind: "shipped",
      expectedLifecycle: "completed",
      resultDigest,
      baseProofOid: baseOid,
    },
    refs: { localOid: stamp.sha, remote: null },
  };
}

describe("shipped teardown retirement evidence", () => {
  it("pins the base commit before deriving shipped evidence", async () => {
    const observedBaseRefs: string[] = [];
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args.includes("origin/feat/sample")) throw new Error("no upstream");
      if (args[0] === "rev-parse") return { stdout: `${baseOid}\n` };
      if (args[0] === "cherry") {
        observedBaseRefs.push(args[1] ?? "");
        return { stdout: "" };
      }
      if (args[0] === "ls-tree") {
        observedBaseRefs.push(args[5] ?? "");
        return { stdout: `${metaPath}\0${specPath}\0` };
      }
      if (args[0] === "show") {
        observedBaseRefs.push((args[1] ?? "").split(":", 1)[0] ?? "");
        return { stdout: meta };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    };
    const context = createGitRetirementAuthorizationContext(
      exec,
      "main",
      async (ref, path) => {
        observedBaseRefs.push(ref);
        return blobs.get(path) ?? null;
      },
    );

    await expect(context.readShippedEvidence({
      subject: stamp.subject,
      branch,
      head: stamp.sha,
      remote: "origin",
      requestedMode: "shipped",
    })).resolves.not.toBeNull();
    expect(new Set(observedBaseRefs)).toEqual(new Set([baseOid]));
  });

  it("does not authorize when the completed projection is missing", async () => {
    const context = createGitRetirementAuthorizationContext(
      execWithCompletedProjection({ includeProjection: false }),
      "main",
      readBlob,
    );
    await expect(context.readShippedEvidence({
      subject: stamp.subject,
      branch,
      head: stamp.sha,
      remote: "origin",
      requestedMode: "shipped",
    })).resolves.toBeNull();
  });

  it("revalidates the same exact completed artifact-group digest", async () => {
    const exec = execWithCompletedProjection();
    const digest = await readCompletedProjectionDigest(exec, "main", stamp.subject, readBlob);
    expect(digest).not.toBeNull();
    if (digest === null) return;

    await expect(revalidateHuskRetirementEvidence(exec, stamp, proof(digest), "main", readBlob)).resolves.toBe(true);
    await expect(revalidateHuskRetirementEvidence(
      execWithCompletedProjection({ ancestry: false }),
      stamp,
      proof(digest),
      "main",
      readBlob,
    )).resolves.toBe(true);
  });

  it("fails closed when the completed projection cannot be read", async () => {
    const exec = execWithCompletedProjection();
    const unreadable: TeardownBlobReader = async () => { throw new Error("blob unavailable"); };
    await expect(revalidateHuskRetirementEvidence(
      exec,
      stamp,
      proof(`sha256:${"c".repeat(64)}`),
      "main",
      unreadable,
    )).resolves.toBe(false);
  });

  it("rejects shipped evidence copied onto an unpreserved retiring head", async () => {
    const exec = execWithCompletedProjection();
    const digest = await readCompletedProjectionDigest(exec, "main", stamp.subject, readBlob);
    expect(digest).not.toBeNull();
    if (digest === null) return;
    const unpreserved: GitExec = async (cmd, args, options) => {
      if (args[0] === "cherry" && args[2] === stamp.sha) return { stdout: `+ ${stamp.sha}\n` };
      return await exec(cmd, args, options);
    };

    await expect(revalidateHuskRetirementEvidence(
      unpreserved,
      stamp,
      proof(digest),
      "main",
      readBlob,
    )).resolves.toBe(false);
  });

  it("detects trailing-byte changes in the committed projection", async () => {
    const exec = execWithCompletedProjection();
    const digest = await readCompletedProjectionDigest(exec, "main", stamp.subject, readBlob);
    expect(digest).not.toBeNull();
    if (digest === null) return;
    const original = blobs.get(specPath);
    expect(original).toBeDefined();
    if (original === undefined) return;
    blobs.set(specPath, new Uint8Array([...original, 0x00]));
    try {
      await expect(revalidateHuskRetirementEvidence(
        exec,
        stamp,
        proof(digest),
        "main",
        readBlob,
      )).resolves.toBe(false);
    } finally {
      blobs.set(specPath, original);
    }
  });
});

describe("decompose teardown retirement evidence", () => {
  const sourceHead = "a".repeat(40);
  const resultHead = "c".repeat(40);
  const resultParent = "d".repeat(40);
  const originMetaPath = validateManagedPath(".arc/active/meta-origin.md");
  const originDraftPath = validateManagedPath(".arc/active/draft-origin.md");
  const dependentPath = validateManagedPath(".arc/active/meta-dependent.md");
  const alphaPath = validateManagedPath(".arc/backlog/planned/origin/alpha/meta-alpha.md");
  const betaPath = validateManagedPath(".arc/backlog/planned/origin/beta/meta-beta.md");
  const originMeta = renderMetaProjectionFile("origin", {
    State: "Planning",
    Branch: "plan/origin",
    "Depends On": "upstream",
  });
  const originDraft = "# Draft: origin\n\nSource material.\n";
  const dependentMeta = renderMetaProjectionFile("dependent", {
    State: "Active",
    Branch: "feat/dependent",
    "Depends On": "origin",
  });
  const alphaMeta = renderMetaProjectionFile("alpha", {
    State: "Planning",
    Branch: "[none]",
    "Depends On": "upstream",
  });
  const betaMeta = renderMetaProjectionFile("beta", { State: "Planning", Branch: "[none]" });
  const sourcePaths = [originMetaPath, originDraftPath, dependentPath];
  const resultPaths = [dependentPath, alphaPath, betaPath];
  const sourceBlobs = new Map<ManagedPath, Uint8Array>([
    [originMetaPath, new TextEncoder().encode(originMeta)],
    [originDraftPath, new TextEncoder().encode(originDraft)],
    [dependentPath, new TextEncoder().encode(dependentMeta)],
  ]);
  const resultBlobs = new Map<ManagedPath, Uint8Array>([
    [dependentPath, new TextEncoder().encode(dependentMeta)],
    [alphaPath, new TextEncoder().encode(alphaMeta)],
    [betaPath, new TextEncoder().encode(betaMeta)],
  ]);
  const sourceIndex = buildLifecycleIndexFromMetas([
    { path: originMetaPath, content: originMeta },
    { path: dependentPath, content: dependentMeta },
  ]);
  const derived = deriveDecomposeInventories({
    originSlug: "origin",
    sourceArtifacts: [
      { path: originMetaPath, bytes: sourceBlobs.get(originMetaPath) as Uint8Array },
      { path: originDraftPath, bytes: sourceBlobs.get(originDraftPath) as Uint8Array },
    ],
    lifecycleIndex: sourceIndex,
  });
  if (derived.status !== "derived") throw new Error(derived.reason);
  const inventoryDigests = decomposeInventoryDigests(derived.inventories);
  const allocation = {
    schemaVersion: 2 as const,
    origin: { slug: "origin", phase: "Planning" as const, location: "active" as const },
    shape: "symmetric" as const,
    parentPosition: "standalone" as const,
    cohort: "origin",
    entries: [
      { kind: "new-member" as const, destinationId: "alpha", slug: "alpha", workClass: "Light" as const },
      { kind: "new-member" as const, destinationId: "beta", slug: "beta", workClass: "Light" as const },
    ],
    internalEdges: [],
    sourceAllocations: derived.inventories.sourceInventory.map((source) => ({
      sourceId: source.sourceId,
      ownership: "destination-owned" as const,
      disposition: { kind: "drop" as const, reason: "not retained" },
    })),
    incomingEdges: [{
      dependent: "dependent",
      disposition: { kind: "replace" as const, replacementTargets: ["alpha"] },
    }],
    outgoingEdges: [{
      prerequisite: "upstream",
      disposition: { kind: "targets" as const, targets: ["alpha"] },
    }],
  };
  const cutMapDigest = canonicalDigest(allocation);
  const receiptIdValue = canonicalDigest("decompose-receipt");
  const targetDigest = (path: ManagedPath, bytes: Uint8Array) => ({
    path: path.slice(0, path.lastIndexOf("/")),
    artifactDigest: artifactGroupDigest([{
      path,
      state: "present" as const,
      contentDigest: contentDigest(bytes),
    }]),
  });
  const receipt: RetirementReceipt = {
    schemaVersion: 2,
    receiptId: receiptIdValue,
    subject: { kind: "work-unit", name: "origin" },
    transition: "decompose",
    source: {
      branch: "plan/origin",
      head: sourceHead,
      artifactDigest: artifactGroupDigest([
        ...[originMetaPath, originDraftPath].map((path) => ({
          path,
          state: "present" as const,
          contentDigest: contentDigest(sourceBlobs.get(path) as Uint8Array),
        })),
      ]),
    },
    transitionPatchDigest: canonicalDigest("patch"),
    retiringProjection: { kind: "unchanged" },
    authorization: "discard-confirmed",
    inventoryRead: "reachable",
    result: {
      kind: "decompose",
      preparationId: preparationId({
        receiptId: receiptIdValue,
        baseHead: resultParent,
        ...inventoryDigests,
        cutMapDigest,
      }),
      allocation,
      cutMapDigest,
      ...inventoryDigests,
      ...derived.inventories,
      transformedIncomingDependents: [],
      targets: [
        targetDigest(alphaPath, resultBlobs.get(alphaPath) as Uint8Array),
        targetDigest(betaPath, resultBlobs.get(betaPath) as Uint8Array),
      ],
    },
  };
  const exec: GitExec = async (_cmd, args) => {
    if (args[0] === "rev-list") return { stdout: `${resultHead} ${resultParent}\n` };
    if (args[0] === "ls-tree") {
      const paths = args.includes(sourceHead) ? sourcePaths : args.includes(resultHead) ? resultPaths : [];
      return { stdout: paths.length === 0 ? "" : `${paths.join("\0")}\0` };
    }
    if (args[0] === "show") {
      const [ref, path] = (args[1] ?? "").split(":");
      const blob = ref === sourceHead
        ? sourceBlobs.get(validateManagedPath(path ?? ""))
        : resultBlobs.get(validateManagedPath(path ?? ""));
      if (blob === undefined) throw new Error("missing blob");
      return { stdout: new TextDecoder().decode(blob) };
    }
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
  const readBlob = async (ref: string, path: ManagedPath) => (
    ref === sourceHead ? sourceBlobs.get(path) : resultBlobs.get(path)
  ) ?? null;

  it("accepts an unchanged coordination-only dependent excluded from the transformed partition", async () => {
    const context = createGitRetirementAuthorizationContext(exec, resultHead, readBlob);

    await expect(context.validateReceiptResult(receipt, {
      retiringHead: sourceHead,
      resultHead,
    })).resolves.toBeNull();
  });

  it("rejects teardown replay when a declared transformed dependent is missing", async () => {
    if (receipt.result.kind !== "decompose") throw new Error("expected decompose receipt");
    const transformedReceipt: RetirementReceipt = {
      ...receipt,
      result: {
        ...receipt.result,
        transformedIncomingDependents: ["dependent"],
      },
    };
    const missingDependentExec: GitExec = async (cmd, args, options) => {
      if (args[0] === "ls-tree" && args.includes(resultHead)) {
        return { stdout: `${[alphaPath, betaPath].join("\0")}\0` };
      }
      return await exec(cmd, args, options);
    };
    const context = createGitRetirementAuthorizationContext(
      missingDependentExec,
      resultHead,
      readBlob,
    );

    await expect(context.validateReceiptResult(transformedReceipt, {
      retiringHead: sourceHead,
      resultHead,
    })).resolves.toBe("conservation-unproven");
  });

  it("rejects a v2 source inventory that underreports the source artifacts", async () => {
    if (receipt.result.kind !== "decompose") throw new Error("expected decompose receipt");
    const sourceInventoryDigest = canonicalDigest([]);
    const underreported: RetirementReceipt = {
      ...receipt,
      result: {
        ...receipt.result,
        sourceInventory: [],
        sourceInventoryDigest,
        preparationId: preparationId({
          receiptId: receipt.receiptId,
          baseHead: resultParent,
          sourceInventoryDigest,
          incomingEdgeInventoryDigest: receipt.result.incomingEdgeInventoryDigest,
          outgoingEdgeInventoryDigest: receipt.result.outgoingEdgeInventoryDigest,
          cutMapDigest,
        }),
      },
    };
    const context = createGitRetirementAuthorizationContext(exec, resultHead, readBlob);

    await expect(context.validateReceiptResult(underreported, {
      retiringHead: sourceHead,
      resultHead,
    })).resolves.toBe("conservation-unproven");
  });

  it("rejects a v2 outgoing inventory that underreports a source prerequisite", async () => {
    if (receipt.result.kind !== "decompose") throw new Error("expected decompose receipt");
    const underreportedAllocation = {
      ...receipt.result.allocation,
      outgoingEdges: [],
    };
    const underreportedCutMapDigest = canonicalDigest(underreportedAllocation);
    const outgoingEdgeInventoryDigest = canonicalDigest([]);
    const underreported: RetirementReceipt = {
      ...receipt,
      result: {
        ...receipt.result,
        allocation: underreportedAllocation,
        cutMapDigest: underreportedCutMapDigest,
        outgoingEdgeInventory: [],
        outgoingEdgeInventoryDigest,
        preparationId: preparationId({
          receiptId: receipt.receiptId,
          baseHead: resultParent,
          sourceInventoryDigest: receipt.result.sourceInventoryDigest,
          incomingEdgeInventoryDigest: receipt.result.incomingEdgeInventoryDigest,
          outgoingEdgeInventoryDigest,
          cutMapDigest: underreportedCutMapDigest,
        }),
      },
    };
    const context = createGitRetirementAuthorizationContext(exec, resultHead, readBlob);

    await expect(context.validateReceiptResult(underreported, {
      retiringHead: sourceHead,
      resultHead,
    })).resolves.toBe("conservation-unproven");
  });
});
