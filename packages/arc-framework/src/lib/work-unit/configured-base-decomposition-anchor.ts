/** Concrete Git adapter for the shared exact-base decomposition integration anchor. */

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import {
  produceDecompositionIntegrationAnchor,
  type DecompositionIntegrationAnchorResult,
  type DecompositionLandingTopology,
} from "./decomposition-integration-anchor.js";
import { enumerateGitRetirementRecords } from "./git-retirement-record-enumeration.js";
import { v3DecomposeReceiptPath } from "./decompose-v3-preparation.js";
import type { V3DecomposeReceipt, V3ManagedPathResult } from "./decompose-v3-receipt.js";
import {
  encodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "./retirement-record-store.js";

interface GitCommit {
  head: string;
  tree: string;
  parents: string[];
}

interface GitTreeEntry {
  mode: string;
  type: string;
  oid: string;
}

export interface ConfiguredBaseDecompositionAnchorDependencies {
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
}

export type ConfiguredBaseDecompositionAnchorResult =
  | DecompositionIntegrationAnchorResult
  | { status: "stale"; reason: "configured-base-raced" }
  | {
      status: "refused";
      reason: "git-read-failed" | "namespace-corrupt";
      /** Exact configured-base commit whose namespace was rejected. */
      ref?: string;
      /** Repository-relative retirement-record path rejected at `ref`. */
      record?: string;
    };

const COMMIT_LINE = /^([0-9a-f]{40}|[0-9a-f]{64})(?: ([0-9a-f ]+))?$/u;
const TREE_LINE = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t(.+)$/u;

async function resolveCommit(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function readCommit(exec: GitExec, head: string): Promise<GitCommit | null> {
  try {
    const [{ stdout: line }, { stdout: tree }] = await Promise.all([
      exec("git", ["rev-list", "--parents", "-n", "1", head]),
      exec("git", ["rev-parse", `${head}^{tree}`]),
    ]);
    const match = COMMIT_LINE.exec(line.trim());
    const treeId = tree.trim();
    if (match === null || match[1] !== head || treeId === "") return null;
    return {
      head,
      tree: treeId,
      parents: match[2]?.split(" ").filter(Boolean) ?? [],
    };
  } catch {
    return null;
  }
}

async function readTreeEntry(exec: GitExec, ref: string, path: string): Promise<GitTreeEntry | null | false> {
  try {
    const { stdout } = await exec("git", ["ls-tree", "-z", ref, "--", `:(literal)${path}`]);
    if (stdout === "") return null;
    const records = stdout.split("\0").filter(Boolean);
    if (records.length !== 1) return false;
    const match = TREE_LINE.exec(records[0] ?? "");
    if (match === null
      || match[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] !== path) return false;
    return { mode: match[1], type: match[2], oid: match[3] };
  } catch {
    return false;
  }
}

async function stateMatches(
  deps: ConfiguredBaseDecompositionAnchorDependencies,
  ref: string,
  path: string,
  expected: V3ManagedPathResult["before"],
): Promise<boolean> {
  const entry = await readTreeEntry(deps.exec, ref, path);
  if (expected.kind === "absent") return entry === null;
  if (entry === null || entry === false || entry.type !== "blob" || entry.mode !== expected.mode) return false;
  try {
    return digestBytes(await deps.readBlob(entry.oid)) === expected.contentDigest;
  } catch {
    return false;
  }
}

async function changedPaths(exec: GitExec, before: string, after: string): Promise<string[] | null> {
  try {
    const { stdout } = await exec("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      before,
      after,
    ]);
    return stdout.split("\0").filter(Boolean).sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)));
  } catch {
    return null;
  }
}

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
  return { topology: { kind: "not-landed" }, candidateHead: null };
}

/**
 * Resolve one exact landed decomposition entirely from pinned Git objects, then close the configured-ref race.
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
  const landing = landingFor(base, preparedBase);
  if (landing.candidateHead === null) return { status: "not-landed" };
  const candidate = await readCommit(deps.exec, landing.candidateHead);
  if (candidate === null) return { status: "refused", reason: "git-read-failed" };
  if (candidate.tree !== base.tree || !await transitionMatches(deps, receipt, candidate)) {
    return { status: "refused", reason: "transition-tree" };
  }
  const result = produceDecompositionIntegrationAnchor({
    receipts: [receipt],
    preparedBaseHead: preparedBase,
    candidateCommit: { head: candidate.head, tree: candidate.tree },
    receiptTransitionTree: candidate.tree,
    currentBaseHead: base.head,
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
