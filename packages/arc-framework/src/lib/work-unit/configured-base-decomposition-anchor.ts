/** Concrete Git adapter for the shared decomposition integration anchor. */

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationAnchorResult,
  type DecompositionLandingRelation,
  type DecompositionLandingTopology,
} from "./decomposition-integration-anchor.js";
import { enumerateGitRetirementRecords } from "./git-retirement-record-enumeration.js";
import { v3DecomposeReceiptPath } from "./decompose-v3-preparation.js";
import type { V3DecomposeReceipt } from "./decompose-v3-receipt.js";
import {
  changedPaths,
  readAncestry,
  readCommit,
  readTreeEntry,
  resolveCommit,
  stateMatches,
  type GitCommit,
} from "./git-decomposition-object-readers.js";
import {
  encodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "./retirement-record-store.js";

export interface ConfiguredBaseDecompositionAnchorDependencies {
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
}

export type ConfiguredBaseDecompositionAnchorResult =
  | DecompositionIntegrationAnchorResult
  | { status: "stale"; reason: "configured-base-raced" }
  | { status: "refused"; reason: "git-read-failed" }
  | {
      status: "refused";
      reason: "namespace-corrupt";
      /** Exact configured-base commit whose namespace was rejected. */
      ref?: string;
      /** Repository-relative retirement-record path rejected at `ref`. */
      record?: string;
    };

async function transitionMatches(
  deps: ConfiguredBaseDecompositionAnchorDependencies,
  receipt: V3DecomposeReceipt,
  candidate: GitCommit,
): Promise<boolean> {
  const preparedBase = receipt.prepared.completedMap.machine.resultBase.head;
  const actualPaths = await changedPaths(deps.exec, preparedBase, candidate.head);
  const expectedPaths = [
    ...receipt.finalized.transitionPatch.map(({ path }) => path),
    v3DecomposeReceiptPath(receipt.receiptId),
  ].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (actualPaths === null || canonicalize(actualPaths) !== canonicalize(expectedPaths)) return false;
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const beforeReceipt = await readTreeEntry(deps.exec, preparedBase, receiptPath);
  const afterReceipt = await readTreeEntry(deps.exec, candidate.head, receiptPath);
  if (beforeReceipt !== null
    || afterReceipt === null
    || afterReceipt === false
    || afterReceipt.type !== "blob"
    || afterReceipt.mode !== "100644") return false;
  try {
    const expectedReceiptDigest = digestBytes(new TextEncoder().encode(canonicalize(receipt)));
    if (digestBytes(await deps.readBlob(afterReceipt.oid)) !== expectedReceiptDigest) return false;
  } catch {
    return false;
  }
  for (const entry of receipt.finalized.transitionPatch) {
    if (!await stateMatches(deps, preparedBase, entry.path, entry.before)
      || !await stateMatches(deps, candidate.head, entry.path, entry.after)) return false;
  }
  return true;
}

function selectReceipt(
  records: Awaited<ReturnType<typeof enumerateGitRetirementRecords>>,
  matches: (receipt: V3DecomposeReceipt) => boolean,
): { status: "selected"; receipt: V3DecomposeReceipt }
  | { status: "absent" }
  | { status: "ambiguous" }
  | { status: "corrupt"; record?: string } {
  if (records.status === "namespace-corrupt") {
    return {
      status: "corrupt",
      ...(records.filename === undefined
        ? {}
        : { record: `${RETIREMENT_RECORD_NAMESPACE}/${records.filename}` }),
    };
  }
  if (records.status === "version-conflict") {
    return {
      status: "corrupt",
      record: `${RETIREMENT_RECORD_NAMESPACE}/${
        encodeRetirementRecordKey(records.id)
      }.json`,
    };
  }
  const receipts = records.records.flatMap(({ record }) =>
    record.kind === "v3-decomposition-receipt"
      && matches(record.value)
      ? [record.value]
      : []);
  if (receipts.length === 0) return { status: "absent" };
  if (receipts.length !== 1 || receipts[0] === undefined) return { status: "ambiguous" };
  return { status: "selected", receipt: receipts[0] };
}

function landingFor(base: GitCommit, preparedBase: string): {
  topology: DecompositionLandingTopology;
  candidateHead: string | null;
} {
  if (base.parents.length === 1 && base.parents[0] === preparedBase) {
    return {
      topology: {
        kind: "fast-forward",
        beforeHead: preparedBase,
        resultHead: base.head,
        resultTree: base.tree,
      },
      candidateHead: base.head,
    };
  }
  if (base.parents.length === 2 && base.parents[0] === preparedBase && base.parents[1] !== undefined) {
    return {
      topology: {
        kind: "merge",
        resultHead: base.head,
        resultTree: base.tree,
        parents: base.parents,
      },
      candidateHead: base.parents[1],
    };
  }
  if (base.parents.length === 2 && base.parents[1] === preparedBase) {
    return {
      topology: {
        kind: "fast-forward",
        beforeHead: preparedBase,
        resultHead: base.head,
        resultTree: base.tree,
      },
      candidateHead: base.head,
    };
  }
  return { topology: { kind: "not-landed" }, candidateHead: null };
}

interface LocatedLanding {
  topology: Exclude<DecompositionLandingTopology, { kind: "not-landed" | "ambiguous" }>;
  candidate: GitCommit;
  relation: DecompositionLandingRelation;
}

type LandingSearchResult =
  | { status: "selected"; landing: LocatedLanding }
  | { status: "not-landed" }
  | { status: "ambiguous" }
  | { status: "read-failed" }
  | { status: "transition-tree" };

function sameTreeEntry(
  left: Awaited<ReturnType<typeof readTreeEntry>>,
  right: Awaited<ReturnType<typeof readTreeEntry>>,
): boolean {
  if (left === false || right === false) return false;
  if (left === null || right === null) return left === right;
  return left.mode === right.mode && left.type === right.type && left.oid === right.oid;
}

async function descendantMergeCompositionMatches(
  deps: ConfiguredBaseDecompositionAnchorDependencies,
  receipt: V3DecomposeReceipt,
  landing: GitCommit,
  candidate: GitCommit,
): Promise<boolean> {
  const firstParent = landing.parents[0];
  if (firstParent === undefined) return false;
  const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
  const touched = new Set([
    ...receipt.finalized.transitionPatch.map(({ path }) => path),
    receiptPath,
  ]);
  const changed = await changedPaths(deps.exec, firstParent, landing.head);
  if (changed === null || changed.some((path) => !touched.has(path))) return false;
  const projectionPath = receipt.prepared.prospectiveProjection.roadmap.path;
  for (const path of touched) {
    if (path === projectionPath) continue;
    const [candidateEntry, landingEntry] = await Promise.all([
      readTreeEntry(deps.exec, candidate.head, path),
      readTreeEntry(deps.exec, landing.head, path),
    ]);
    if (!sameTreeEntry(candidateEntry, landingEntry)) return false;
  }
  return true;
}

async function enumerateGainedCommits(
  exec: GitExec,
  preparedBase: string,
  currentBase: string,
): Promise<string[] | null> {
  try {
    const { stdout } = await exec("git", [
      "rev-list",
      "--topo-order",
      currentBase,
      `^${preparedBase}`,
    ]);
    return stdout.split(/\s+/u).filter(Boolean);
  } catch {
    return null;
  }
}

async function searchLanding(
  deps: ConfiguredBaseDecompositionAnchorDependencies,
  receipt: V3DecomposeReceipt,
  base: GitCommit,
  preparedBase: string,
): Promise<LandingSearchResult> {
  const baseRelation = landingFor(base, preparedBase);
  if (baseRelation.candidateHead !== null) {
    const candidate = await readCommit(deps.exec, baseRelation.candidateHead);
    if (candidate === null) return { status: "read-failed" };
    if (!await transitionMatches(deps, receipt, candidate)
      || candidate.tree !== base.tree) return { status: "transition-tree" };
    return {
      status: "selected",
      landing: {
        topology: baseRelation.topology as LocatedLanding["topology"],
        candidate,
        relation: { kind: "exact" },
      },
    };
  }

  const preparedRelation = await readAncestry(deps.exec, preparedBase, base.head);
  if (preparedRelation === "not-ancestor") return { status: "not-landed" };
  if (preparedRelation === "unresolvable") return { status: "read-failed" };
  const gained = await enumerateGainedCommits(deps.exec, preparedBase, base.head);
  if (gained === null) return { status: "read-failed" };

  const commitCache = new Map<string, GitCommit>();
  const replayCache = new Map<string, boolean>();
  const read = async (head: string): Promise<GitCommit | null> => {
    const cached = commitCache.get(head);
    if (cached !== undefined) return cached;
    const commit = await readCommit(deps.exec, head);
    if (commit !== null) commitCache.set(head, commit);
    return commit;
  };
  const replays = async (candidate: GitCommit): Promise<boolean> => {
    const cached = replayCache.get(candidate.head);
    if (cached !== undefined) return cached;
    const matches = await transitionMatches(deps, receipt, candidate);
    replayCache.set(candidate.head, matches);
    return matches;
  };

  const hits: Array<LocatedLanding & { compositionMatches: boolean }> = [];
  for (const head of gained) {
    const commit = await read(head);
    if (commit === null) return { status: "read-failed" };
    const exact = landingFor(commit, preparedBase);
    if (exact.candidateHead !== null) {
      const candidate = await read(exact.candidateHead);
      if (candidate === null) return { status: "read-failed" };
      if (!await replays(candidate)) continue;
      hits.push({
        topology: exact.topology as LocatedLanding["topology"],
        candidate,
        relation: { kind: "exact" },
        compositionMatches: candidate.tree === commit.tree,
      });
      continue;
    }
    const firstParent = commit.parents[0];
    const secondParent = commit.parents[1];
    if (commit.parents.length !== 2
      || firstParent === undefined
      || secondParent === undefined
      || firstParent === preparedBase) continue;
    const slotZeroRelation = await readAncestry(deps.exec, preparedBase, firstParent);
    if (slotZeroRelation === "unresolvable") return { status: "read-failed" };
    if (slotZeroRelation !== "ancestor") continue;
    const candidate = await read(secondParent);
    if (candidate === null) return { status: "read-failed" };
    if (!await replays(candidate)) continue;
    const candidateContainment = await readAncestry(deps.exec, candidate.head, firstParent);
    if (candidateContainment === "unresolvable") return { status: "read-failed" };
    if (candidateContainment === "ancestor") continue;
    const receiptPath = v3DecomposeReceiptPath(receipt.receiptId);
    const existingReceipt = await readTreeEntry(deps.exec, firstParent, receiptPath);
    if (existingReceipt === false) return { status: "read-failed" };
    if (existingReceipt !== null) continue;
    const compositionMatches = await descendantMergeCompositionMatches(
      deps,
      receipt,
      commit,
      candidate,
    );
    hits.push({
      topology: {
        kind: "merge",
        resultHead: commit.head,
        resultTree: commit.tree,
        parents: commit.parents,
      },
      candidate,
      relation: {
        kind: "descendant-merge",
        slotZeroDescent: { from: preparedBase, to: firstParent },
        composition: compositionMatches ? "matches" : "deviates",
      },
      compositionMatches,
    });
  }
  if (hits.length === 0) return { status: "not-landed" };

  const maximal: typeof hits = [];
  for (const hit of hits) {
    let containsEveryHit = true;
    for (const other of hits) {
      if (other.topology.resultHead === hit.topology.resultHead) continue;
      const relation = await readAncestry(
        deps.exec,
        other.topology.resultHead,
        hit.topology.resultHead,
      );
      if (relation === "unresolvable") return { status: "read-failed" };
      if (relation !== "ancestor") {
        containsEveryHit = false;
        break;
      }
    }
    if (containsEveryHit) maximal.push(hit);
  }
  if (maximal.length !== 1 || maximal[0] === undefined) return { status: "ambiguous" };
  const selected = maximal[0];
  if (!selected.compositionMatches) return { status: "transition-tree" };
  return {
    status: "selected",
    landing: {
      topology: selected.topology,
      candidate: selected.candidate,
      relation: selected.relation,
    },
  };
}

/**
 * Resolve one landed decomposition entirely from pinned Git objects, then close the configured-ref race.
 */
async function resolveConfiguredBaseAnchor(
  configuredBaseRef: string,
  matches: (receipt: V3DecomposeReceipt) => boolean,
  deps: ConfiguredBaseDecompositionAnchorDependencies,
): Promise<ConfiguredBaseDecompositionAnchorResult> {
  const baseHead = await resolveCommit(deps.exec, configuredBaseRef);
  if (baseHead === null) return { status: "refused", reason: "git-read-failed" };
  let namespace;
  try {
    namespace = await enumerateGitRetirementRecords(deps.exec, baseHead);
  } catch {
    return { status: "refused", reason: "git-read-failed" };
  }
  const selected = selectReceipt(namespace, matches);
  if (selected.status === "absent") return { status: "absent" };
  if (selected.status === "ambiguous") return { status: "ambiguous" };
  if (selected.status === "corrupt") {
    return {
      status: "refused",
      reason: "namespace-corrupt",
      ref: baseHead,
      ...(selected.record === undefined ? {} : { record: selected.record }),
    };
  }
  const receipt = selected.receipt;
  const base = await readCommit(deps.exec, baseHead);
  if (base === null) return { status: "refused", reason: "git-read-failed" };
  const preparedBase = receipt.prepared.completedMap.machine.resultBase.head;
  const searched = await searchLanding(deps, receipt, base, preparedBase);
  if (searched.status === "not-landed") return { status: "not-landed" };
  if (searched.status === "ambiguous") return { status: "ambiguous" };
  if (searched.status === "read-failed") return { status: "refused", reason: "git-read-failed" };
  if (searched.status === "transition-tree") {
    return { status: "refused", reason: "transition-tree" };
  }
  const { landing } = searched;
  const landingHead = landing.topology.resultHead;
  const baseRelation = landingHead === base.head
    ? "ancestor"
    : await readAncestry(deps.exec, landingHead, base.head);
  if (baseRelation === "not-ancestor") return { status: "not-landed" };
  if (baseRelation === "unresolvable") return { status: "refused", reason: "git-read-failed" };
  const result = produceDecompositionIntegrationAnchor({
    receipts: [receipt],
    preparedBaseHead: preparedBase,
    candidateCommit: { head: landing.candidate.head, tree: landing.candidate.tree },
    receiptTransitionTree: landing.candidate.tree,
    currentBaseHead: base.head,
    baseDescent: landingHead === base.head
      ? { kind: "exact" }
      : { kind: "descendant", from: landingHead, to: base.head },
    landingRelation: landing.relation,
    landing: landing.topology,
  });
  if (result.status !== "resolved") return result;
  if (await resolveCommit(deps.exec, configuredBaseRef) !== baseHead) {
    return { status: "stale", reason: "configured-base-raced" };
  }
  return result;
}

/**
 * Resolve one landed decomposition selected by its source origin.
 *
 * @param configuredBaseRef - Exact configured-base ref or commit
 * @param origin - Retired origin slug recorded by the receipt
 * @param deps - Git and byte-preserving object reads
 * @returns The exact-base anchor or a closed no-authority result
 */
export async function resolveConfiguredBaseDecompositionAnchor(
  configuredBaseRef: string,
  origin: string,
  deps: ConfiguredBaseDecompositionAnchorDependencies,
): Promise<ConfiguredBaseDecompositionAnchorResult> {
  return resolveConfiguredBaseAnchor(
    configuredBaseRef,
    (receipt) => receipt.prepared.completedMap.machine.source.origin === origin,
    deps,
  );
}

/**
 * Resolve one landed decomposition selected by its canonical receipt identity.
 *
 * @param configuredBaseRef - Exact configured-base ref or commit
 * @param receiptId - Receipt identity carried by a new planning leaf
 * @param deps - Git and byte-preserving object reads
 * @returns The exact-base anchor or a closed no-authority result
 */
export async function resolveConfiguredBaseDecompositionAnchorByReceiptId(
  configuredBaseRef: string,
  receiptId: string,
  deps: ConfiguredBaseDecompositionAnchorDependencies,
): Promise<ConfiguredBaseDecompositionAnchorResult> {
  return resolveConfiguredBaseAnchor(
    configuredBaseRef,
    (receipt) => receipt.receiptId === receiptId,
    deps,
  );
}
