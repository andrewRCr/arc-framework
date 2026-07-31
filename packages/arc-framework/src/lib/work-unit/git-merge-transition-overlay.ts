/**
 * Git adapter for selecting one finalized decomposition overlay from a merge snapshot.
 */

import {
  canonicalize,
  digestBytes,
} from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import {
  selectMergeTransitionOverlay,
  type MergeTransitionOverlaySelection,
  type PinnedMergeReceiptCandidate,
  type PinnedMergeOperation,
  type PinnedMergeReceiptProvenance,
  type PinnedMergeValidationFacts,
} from "./merge-transition-overlay.js";
import {
  v3DecomposeReceiptPath,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  isV3DecomposeReceiptRestatement,
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";
import { v3SourceArtifactDigest } from "./decompose-v3-schema.js";
import { readTreeEntry } from "./git-decomposition-object-readers.js";
import { readGitV3DecomposeTreeSnapshot } from "./git-decompose-v3-preflight.js";
import {
  validateRetirementRecordEnumeration,
  type EnumeratedRetirementRecord,
  type RetirementRecordEnumerationEntry,
} from "./retirement-record-enumeration.js";
import {
  encodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "./retirement-record-store.js";

/** Filesystem boundary used to read repository operation markers. */
export interface GitMergeTransitionOverlayFs {
  readFile(path: string): Promise<string>;
}

/** I/O dependencies for merge-transition overlay selection. */
export interface GitMergeTransitionOverlayDependencies {
  cwd: string;
  exec: GitExec;
  fs: GitMergeTransitionOverlayFs;
  readBlob(oid: string): Promise<Uint8Array>;
}

/** Adapter result, including Git-specific closed failures. */
export type GitMergeTransitionOverlayResult =
  | MergeTransitionOverlaySelection
  | { status: "stale"; reason: "snapshot-raced" }
  | { status: "refused"; reason: "git-read-failed" }
  | {
      status: "refused";
      reason: "namespace-corrupt";
      /** Exact pinned tree or commit whose namespace/path evidence was rejected. */
      ref?: string;
      /** Repository-relative retirement-record path rejected at `ref`. */
      record?: string;
    };

const OPERATION_MARKERS = [
  ["MERGE_HEAD", "merge"],
  ["REBASE_HEAD", "rebase"],
  ["CHERRY_PICK_HEAD", "cherry-pick"],
  ["REVERT_HEAD", "revert"],
] as const;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const TREE_ENTRY_PATTERN = /^(100644|100755) blob ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/u;
const NAMESPACE_ENTRY_PATTERN =
  /^([0-7]{6}) ([^ ]+) ([0-9a-f]{40}|[0-9a-f]{64})\t([\s\S]+)$/u;

interface OperationMarkerSnapshot {
  paths: Readonly<Record<(typeof OPERATION_MARKERS)[number][0], string>>;
  contents: Readonly<Record<(typeof OPERATION_MARKERS)[number][0], string | null>>;
}

interface PinnedMergeSnapshot {
  operation: Extract<PinnedMergeOperation, { kind: "merge" }>;
  markers: OperationMarkerSnapshot;
}

interface PinnedNamespace {
  records: readonly EnumeratedRetirementRecord[];
}

class NamespaceCorruptError extends Error {
  constructor(
    message: string,
    readonly ref: string,
    readonly record: string,
  ) {
    super(message);
  }
}

async function readOptionalFile(
  fs: GitMergeTransitionOverlayFs,
  path: string,
): Promise<string | null> {
  try {
    return await fs.readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readOperationMarkers(
  deps: GitMergeTransitionOverlayDependencies,
): Promise<OperationMarkerSnapshot> {
  const resolved = await Promise.all(OPERATION_MARKERS.map(async ([name]) => {
    const { stdout } = await deps.exec("git", [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      name,
    ], { cwd: deps.cwd });
    const path = stdout.trim();
    if (path === "") throw new Error(`Git returned an empty ${name} path`);
    return [name, path] as const;
  }));
  const paths = Object.fromEntries(resolved) as Record<
    (typeof OPERATION_MARKERS)[number][0],
    string
  >;
  const contents = Object.fromEntries(await Promise.all(resolved.map(async ([name, path]) =>
    [name, await readOptionalFile(deps.fs, path)] as const))) as Record<
      (typeof OPERATION_MARKERS)[number][0],
      string | null
    >;
  return { paths, contents };
}

function classifyOperation(snapshot: OperationMarkerSnapshot):
  | PinnedMergeOperation
  | { kind: "merge-marker" } {
  const present = OPERATION_MARKERS.filter(([name]) => snapshot.contents[name] !== null);
  if (present.length === 0) return { kind: "ordinary" };
  if (present.length !== 1) return { kind: "ambiguous" };
  const kind = present[0]?.[1];
  if (kind === "merge") return { kind: "merge-marker" };
  if (kind === "rebase" || kind === "cherry-pick" || kind === "revert") return { kind };
  return { kind: "ambiguous" };
}

function parseMergeHeads(content: string | null): string[] | null {
  if (content === null) return null;
  const lines = content.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0 || lines.some((line) => !GIT_OBJECT_ID.test(line))) return null;
  return lines;
}

async function resolveCommit(
  deps: GitMergeTransitionOverlayDependencies,
  ref: string,
): Promise<string> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    cwd: deps.cwd,
  });
  const oid = stdout.trim();
  if (!GIT_OBJECT_ID.test(oid)) throw new Error(`Git returned an invalid commit for ${ref}`);
  return oid;
}

async function resolveIndexTree(
  deps: GitMergeTransitionOverlayDependencies,
): Promise<string> {
  const { stdout } = await deps.exec("git", ["write-tree"], { cwd: deps.cwd });
  const oid = stdout.trim();
  if (!GIT_OBJECT_ID.test(oid)) throw new Error("Git returned an invalid index tree");
  return oid;
}

async function captureMergeSnapshot(
  configuredBaseRef: string,
  markers: OperationMarkerSnapshot,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<PinnedMergeSnapshot | null> {
  const mergeHeadOids = parseMergeHeads(markers.contents.MERGE_HEAD);
  if (configuredBaseRef === "" || mergeHeadOids === null) return null;
  const [headOid, configuredBaseOid, candidateTreeOid] = await Promise.all([
    resolveCommit(deps, "HEAD"),
    resolveCommit(deps, configuredBaseRef),
    resolveIndexTree(deps),
  ]);
  return {
    markers,
    operation: {
      kind: "merge",
      headOid,
      mergeHeadOids,
      configuredBase: { ref: configuredBaseRef, oid: configuredBaseOid },
      candidateTreeOid,
    },
  };
}

function sameMarkerContents(
  left: OperationMarkerSnapshot,
  right: OperationMarkerSnapshot,
): boolean {
  return OPERATION_MARKERS.every(([name]) => left.contents[name] === right.contents[name]);
}

async function rereadMarkerContents(
  snapshot: OperationMarkerSnapshot,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<OperationMarkerSnapshot> {
  const contents = Object.fromEntries(await Promise.all(OPERATION_MARKERS.map(async ([name]) =>
    [name, await readOptionalFile(deps.fs, snapshot.paths[name])] as const))) as Record<
      (typeof OPERATION_MARKERS)[number][0],
      string | null
    >;
  return { paths: snapshot.paths, contents };
}

async function snapshotIsCurrent(
  snapshot: PinnedMergeSnapshot,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<boolean> {
  const [markers, headOid, configuredBaseOid, candidateTreeOid] = await Promise.all([
    rereadMarkerContents(snapshot.markers, deps),
    resolveCommit(deps, "HEAD"),
    resolveCommit(deps, snapshot.operation.configuredBase.ref),
    resolveIndexTree(deps),
  ]);
  return sameMarkerContents(snapshot.markers, markers)
    && headOid === snapshot.operation.headOid
    && configuredBaseOid === snapshot.operation.configuredBase.oid
    && candidateTreeOid === snapshot.operation.candidateTreeOid;
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function namespaceFilename(path: string): string | null {
  const prefix = `${RETIREMENT_RECORD_NAMESPACE}/`;
  return path.startsWith(prefix) && path.length > prefix.length
    ? path.slice(prefix.length)
    : null;
}

async function readPinnedNamespace(
  ref: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<PinnedNamespace> {
  const { stdout } = await deps.exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-z",
    "--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)",
    ref,
    "--",
    RETIREMENT_RECORD_NAMESPACE,
  ], { cwd: deps.cwd });
  const entries: RetirementRecordEnumerationEntry[] = [];
  for (const raw of stdout.split("\0").filter(Boolean)) {
    const match = NAMESPACE_ENTRY_PATTERN.exec(raw);
    const filename = match?.[4] === undefined ? null : namespaceFilename(match[4]);
    if (match?.[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] === undefined
      || filename === null) {
      const rawPath = raw.includes("\t") ? raw.slice(raw.indexOf("\t") + 1) : "<malformed-entry>";
      throw new NamespaceCorruptError("Malformed retirement namespace entry", ref, rawPath);
    }
    let content = "";
    if (match[1] === "100644" && match[2] === "blob") {
      const bytes = await deps.readBlob(match[3]);
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new NamespaceCorruptError("Retirement record is not UTF-8", ref, match[4]);
      }
    }
    entries.push({
      filename,
      mode: match[1],
      type: match[2],
      content,
    });
  }
  const validated = validateRetirementRecordEnumeration(entries);
  if (validated.status === "namespace-corrupt") {
    const record = validated.filename === undefined
      ? RETIREMENT_RECORD_NAMESPACE
      : `${RETIREMENT_RECORD_NAMESPACE}/${validated.filename}`;
    throw new NamespaceCorruptError("Retirement namespace is not canonical", ref, record);
  }
  if (validated.status === "version-conflict") {
    const record = `${RETIREMENT_RECORD_NAMESPACE}/${
      encodeRetirementRecordKey(validated.id)
    }.json`;
    throw new NamespaceCorruptError("Retirement record identity has conflicting bytes", ref, record);
  }
  return { records: validated.records };
}

async function changedPaths(
  before: string,
  after: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<string[]> {
  const { stdout } = await deps.exec("git", [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    "--no-renames",
    "-z",
    before,
    after,
  ], { cwd: deps.cwd });
  const fields = stdout.split("\0");
  if (fields.at(-1) === "") fields.pop();
  if (fields.some((path) => path === "" || path.includes("\0"))) {
    throw new Error("Git returned malformed changed paths");
  }
  return fields.sort(compareUtf8);
}

async function readPathState(
  ref: string,
  path: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<V3ManagedPathResult["before"]> {
  const { stdout } = await deps.exec("git", [
    "ls-tree",
    "-z",
    ref,
    "--",
    `:(literal)${path}`,
  ], { cwd: deps.cwd });
  if (stdout === "") return { kind: "absent" };
  const records = stdout.split("\0").filter(Boolean);
  const match = records.length === 1 ? TREE_ENTRY_PATTERN.exec(records[0] ?? "") : null;
  if (match?.[1] === undefined || match[2] === undefined || match[3] !== path) {
    throw new Error(`Git returned an unsupported path state for ${path}`);
  }
  return {
    kind: "file",
    mode: match[1] as "100644" | "100755",
    contentDigest: digestBytes(await deps.readBlob(match[2])),
  };
}

function preparationFromReceipt(receipt: V3DecomposeReceipt): V3DecomposePreparation {
  return {
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  };
}

async function buildCandidate(
  record: EnumeratedRetirementRecord,
  provenance: readonly PinnedMergeReceiptProvenance[],
  candidateTreeOid: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<PinnedMergeReceiptCandidate> {
  if (record.record.kind !== "v3-decomposition-receipt") {
    throw new Error("Cannot build a non-v3 decomposition candidate");
  }
  const receipt = record.record.value;
  const preparation = preparationFromReceipt(receipt);
  const machine = preparation.facts.completedMap.machine;
  const sourceSnapshot = await readGitV3DecomposeTreeSnapshot({
    cwd: deps.cwd,
    exec: deps.exec,
    readBlob: async (ref, path) => {
      const entry = await readTreeEntry(
        async (command, args, options) => await deps.exec(command, args, {
          ...options,
          cwd: options?.cwd ?? deps.cwd,
        }),
        ref,
        path,
      );
      if (entry === null) return null;
      if (entry === false || entry.type !== "blob") {
        throw new Error(`Source artifact is not a blob: ${path}`);
      }
      return await deps.readBlob(entry.oid);
    },
  }, machine.source.ref, machine.source.head, machine.source.origin);
  const sourceArtifactInventory = sourceSnapshot.sourceArtifacts.map((artifact) => ({
    path: artifact.path,
    objectKind: artifact.objectKind,
    mode: artifact.mode,
    contentDigest: digestBytes(artifact.bytes),
  }));
  const sourceArtifactDigest = v3SourceArtifactDigest(sourceArtifactInventory);
  if (sourceArtifactDigest === null) throw new Error("Source artifact inventory is not canonical");
  const managedPathResults = await Promise.all(receipt.finalized.managedPathResults.map(async ({ path }) => ({
    path,
    before: await readPathState(machine.resultBase.head, path, deps),
    after: await readPathState(candidateTreeOid, path, deps),
  })));
  return {
    receiptBytes: record.content,
    receiptPath: v3DecomposeReceiptPath(receipt.receiptId),
    derivedCandidateTreeOid: candidateTreeOid,
    provenance,
    validationFacts: {
      preparation,
      receipt,
      sourceArtifactDigest,
      sourceArtifactInventory,
      sourceUnits: machine.sourceUnits,
      sourceAllocations: preparation.facts.completedMap.authoring.sourceAllocations,
      resultBaseHead: machine.resultBase.head,
      candidateOwnership: preparation.facts.candidateOwnership,
      destinationOutputs: receipt.finalized.destinationDigests.map(({ destinationId, outputs }) => ({
        destinationId,
        outputs,
      })),
      incomingEdges: machine.incomingEdges,
      outgoingEdges: machine.outgoingEdges,
      managedPathResults,
      transitionPatch: managedPathResults.filter(({ before, after }) =>
        canonicalize(before) !== canonicalize(after)),
      topology: preparation.facts.topology,
      publication: receipt.finalized.publication,
    },
  };
}

async function parentReceiptState(
  record: EnumeratedRetirementRecord,
  ref: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<"absent" | "matching" | "restated" | "conflicting"> {
  const path = v3DecomposeReceiptPath(record.id);
  const { stdout } = await deps.exec("git", [
    "ls-tree",
    "-z",
    ref,
    "--",
    `:(literal)${path}`,
  ], { cwd: deps.cwd });
  if (stdout === "") return "absent";
  const records = stdout.split("\0").filter(Boolean);
  const match = records.length === 1 ? TREE_ENTRY_PATTERN.exec(records[0] ?? "") : null;
  if (match?.[1] !== "100644" || match[2] === undefined || match[3] !== path) {
    return "conflicting";
  }
  const bytes = await deps.readBlob(match[2]);
  if (Buffer.compare(Buffer.from(bytes), Buffer.from(record.content, "utf8")) === 0) return "matching";
  try {
    return isV3DecomposeReceiptRestatement(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      record.content,
    ) ? "restated" : "conflicting";
  } catch {
    return "conflicting";
  }
}

async function matchingParentProvenance(
  record: EnumeratedRetirementRecord,
  snapshot: PinnedMergeSnapshot,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<PinnedMergeReceiptProvenance[]> {
  const provenance: PinnedMergeReceiptProvenance[] = [{ kind: "candidate-tree" }];
  const headState = await parentReceiptState(record, snapshot.operation.headOid, deps);
  if (headState === "conflicting") {
    throw new NamespaceCorruptError(
      "Retirement record identity has conflicting bytes",
      snapshot.operation.headOid,
      v3DecomposeReceiptPath(record.id),
    );
  }
  if (headState === "matching") {
    provenance.push({ kind: "head", commitOid: snapshot.operation.headOid });
  } else if (headState === "restated") {
    provenance.push({ kind: "restated", parent: "head", commitOid: snapshot.operation.headOid });
  }
  for (const [index, commitOid] of snapshot.operation.mergeHeadOids.entries()) {
    const state = await parentReceiptState(record, commitOid, deps);
    if (state === "conflicting") {
      throw new NamespaceCorruptError(
        "Retirement record identity has conflicting bytes",
        commitOid,
        v3DecomposeReceiptPath(record.id),
      );
    }
    if (state === "matching") {
      provenance.push({ kind: "merge-head", index, commitOid });
    } else if (state === "restated") {
      provenance.push({ kind: "restated", parent: "merge-head", index, commitOid });
    }
  }
  return provenance;
}

async function materializePinnedFacts(
  snapshot: PinnedMergeSnapshot,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<PinnedMergeValidationFacts> {
  const [candidateChangedPaths, candidate] = await Promise.all([
    changedPaths(
      snapshot.operation.configuredBase.oid,
      snapshot.operation.candidateTreeOid,
      deps,
    ),
    readPinnedNamespace(snapshot.operation.candidateTreeOid, deps),
  ]);
  const records = candidate.records.filter(({ record }) =>
    record.kind === "v3-decomposition-receipt")
    .filter(({ id }) => candidateChangedPaths.includes(v3DecomposeReceiptPath(id)));
  const candidates = await Promise.all(records.map(async (record) =>
    await buildCandidate(
      record,
      await matchingParentProvenance(record, snapshot, deps),
      snapshot.operation.candidateTreeOid,
      deps,
    )));
  return {
    operation: snapshot.operation,
    refs: [snapshot.operation.configuredBase],
    candidateChangedPaths,
    candidates,
  };
}

/**
 * Select one transition overlay from the current atomic merge snapshot.
 *
 * @param configuredBaseRef - Configured base ref whose exact commit is pinned
 * @param deps - Git, filesystem, and byte-preserving object reads
 * @returns Selected authority or a closed no-authority outcome
 */
export async function resolveGitMergeTransitionOverlay(
  configuredBaseRef: string,
  deps: GitMergeTransitionOverlayDependencies,
): Promise<GitMergeTransitionOverlayResult> {
  try {
    const markers = await readOperationMarkers(deps);
    const operation = classifyOperation(markers);
    if (operation.kind !== "merge-marker") {
      return selectMergeTransitionOverlay({
        operation,
        refs: [],
        candidateChangedPaths: [],
        candidates: [],
      });
    }
    const snapshot = await captureMergeSnapshot(configuredBaseRef, markers, deps);
    if (snapshot === null) {
      return { status: "refused", reason: "invalid-snapshot" };
    }
    const selection = selectMergeTransitionOverlay(await materializePinnedFacts(snapshot, deps));
    if (selection.status !== "selected") return selection;
    return await snapshotIsCurrent(snapshot, deps)
      ? selection
      : { status: "stale", reason: "snapshot-raced" };
  } catch (error) {
    if (error instanceof NamespaceCorruptError) {
      return {
        status: "refused",
        reason: "namespace-corrupt",
        ref: error.ref,
        record: error.record,
      };
    }
    return { status: "refused", reason: "git-read-failed" };
  }
}
