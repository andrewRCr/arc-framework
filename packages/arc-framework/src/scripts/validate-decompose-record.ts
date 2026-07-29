/** Commit-time gate requiring exact finalized evidence for decompose writes. */

import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { canonicalize, isCanonicalDigest } from "../lib/canonical/canonical-json.js";
import { contentDigest, patchDigest, type PatchOperation } from "../lib/canonical/content-digest.js";
import { validateManagedPath } from "../lib/canonical/managed-path.js";
import { receiptId } from "../lib/canonical/receipt-id.js";
import { readGitBlobBytes } from "../lib/io-context.js";
import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import {
  decodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "../lib/work-unit/retirement-record-store.js";
import { parseRetirementReceipt } from "../lib/work-unit/retirement-receipt-codec.js";
import { artifactMatcher } from "../lib/work-unit/mutators/relocate-artifacts.js";
import {
  v3DecomposeReceiptPath,
  type V3DecomposePreparation,
} from "../lib/work-unit/decompose-v3-preparation.js";
import {
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "../lib/work-unit/decompose-v3-receipt.js";
import { v3SourceArtifactDigest } from "../lib/work-unit/decompose-v3-schema.js";
import type { V3SourceArtifactEntry } from "../lib/work-unit/decompose-v3-schema.js";
import { validateFinalizedV3Decomposition } from "../lib/work-unit/validate-v3-decomposition.js";
import { readGitV3DecomposeTreeSnapshot } from "../lib/work-unit/git-decompose-v3-preflight.js";

/** Closed-stdin subprocess policies owned by the decompose-record hook adapter. */
export const validateDecomposeRecordInputPolicyDeclarations = [{
  commandPath: "hook-validate-decompose-record",
  aliases: [],
  sites: [1, 2, 3, 4, 5, 6, 7].map((occurrence) => declareInteractionSite(
    { file: "scripts/validate-decompose-record.ts", kind: "subprocess", callee: "execFileAsync", occurrence },
    {
      acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: "hook-validate-decompose-record subprocess boundary", subprocess: "close-stdin",
    },
  )),
}] satisfies readonly CommandInputDeclaration[];

export interface StagedPathChange {
  status: "A" | "M" | "D";
  path: string;
}

export interface DecomposeCommitGateInput {
  changes: readonly StagedPathChange[];
  /** Merge commits exempt only result states inherited exactly from one of their parents. */
  mergeInProgress?: boolean;
  readIndexBytes(path: string): Uint8Array | null;
  readHeadBytes(path: string): Uint8Array | null;
  /** Resolve a preparation-bound source or result-base ref to one exact commit. */
  resolveRef?(ref: string): string | null;
  /** Exact normalized path state at a commit, or at the staged index for `null`. */
  readPathState?(
    ref: string | null,
    path: string,
  ): V3ManagedPathResult["before"];
  /** Complete source-artifact inventory reconstructed from the pinned source tree. */
  readSourceArtifactInventory?(
    preparation: V3DecomposePreparation,
  ): readonly V3SourceArtifactEntry[] | null;
  /** Exact blob/absence state for every merge parent, including `HEAD`. */
  readParentBytes?(path: string): readonly (Uint8Array | null)[];
}

/** Decode NUL-framed `git diff --name-status` output without path loss. */
export function parseStagedPathChanges(output: string): StagedPathChange[] {
  if (output === "") return [];
  const fields = output.split("\0");
  if (fields.pop() !== "" || fields.length % 2 !== 0) {
    throw new Error("malformed NUL-framed Git name-status output");
  }
  const changes: StagedPathChange[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if ((status !== "A" && status !== "M" && status !== "D") || path === undefined || path === "") {
      throw new Error(`unsupported staged change record: ${status ?? ""}`);
    }
    changes.push({ status, path });
  }
  return changes;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

const RECORD_PATTERN = new RegExp(
  `^${escapeRegExp(RETIREMENT_RECORD_NAMESPACE)}/(sha256-[0-9a-f]{64})\\.json$`,
  "u",
);
const FORBIDDEN_ROOT_INTERNAL_NAMESPACE = ".arc/.internal";
const ACTIVE_META_PATTERN = /^\.arc\/active\/meta-([^/]+)\.md$/u;
const NESTED_LIFECYCLE_META_PATTERN =
  /^\.arc\/(?:backlog\/(?:planned|provisional)|completed)(?:\/[^/]+)*\/meta-([^/]+)\.md$/u;

function lifecycleMetaSlug(path: string): string | undefined {
  return ACTIVE_META_PATTERN.exec(path)?.[1] ?? NESTED_LIFECYCLE_META_PATTERN.exec(path)?.[1];
}

function apparentlyRetiredSlugs(changes: readonly StagedPathChange[]): string[] {
  const deletedOrigins = changes
    .filter((change) => change.status === "D")
    .map((change) => lifecycleMetaSlug(change.path))
    .filter((slug): slug is string => slug !== undefined);
  const addedTargets = changes
    .filter((change) => change.status === "A")
    .map((change) => lifecycleMetaSlug(change.path))
    .filter((slug): slug is string => slug !== undefined);
  return deletedOrigins.filter((origin) => !addedTargets.includes(origin));
}

interface ReceiptCoverage {
  covered: Set<string>;
  failedSubjects: Set<string>;
  errors: string[];
}

function receiptCoveredRetirements(
  changes: readonly StagedPathChange[],
  readIndexBytes: DecomposeCommitGateInput["readIndexBytes"],
  readHeadBytes: DecomposeCommitGateInput["readHeadBytes"],
): ReceiptCoverage {
  const covered = new Set<string>();
  const failedSubjects = new Set<string>();
  const errors: string[] = [];
  const recordPaths = new Set(changes.filter((change) => RECORD_PATTERN.test(change.path)).map((change) => change.path));
  const operations: PatchOperation[] = [];
  try {
    for (const change of changes) {
      if (recordPaths.has(change.path)) continue;
      const path = validateManagedPath(change.path);
      if (change.status === "D") operations.push({ operation: "delete", path });
      else {
        const staged = readIndexBytes(change.path);
        if (staged === null) return { covered, failedSubjects, errors };
        operations.push({ operation: "write", path, contentDigest: contentDigest(staged) });
      }
    }
  } catch {
    return { covered, failedSubjects, errors };
  }
  const stagedPatchDigest = patchDigest(operations);
  for (const change of changes) {
    const pathMatch = RECORD_PATTERN.exec(change.path);
    if (pathMatch?.[1] === undefined) continue;
    const bytes = readIndexBytes(change.path);
    if (bytes === null) continue;
    try {
      const receipt = parseRetirementReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (receipt?.subject.kind !== "work-unit"
        || (receipt.transition !== "abandon" && receipt.transition !== "decompose" && receipt.transition !== "rename")
        || decodeRetirementRecordKey(pathMatch[1]) !== receipt.receiptId
        || receipt.receiptId !== receiptId({
          schemaVersion: receipt.schemaVersion,
          subject: receipt.subject,
          transition: receipt.transition,
          sourceBranch: receipt.source.branch,
          sourceHead: receipt.source.head,
        })) continue;

      if (receipt.transition === "rename") {
        const subject = receipt.subject.name;
        const fail = (message: string): void => {
          failedSubjects.add(subject);
          errors.push(message);
        };
        if (change.status !== "A" || readHeadBytes(change.path) !== null) {
          fail(`rename retirement record already exists or was amended for: ${subject}`);
          continue;
        }
        const targetSlug = receipt.result.kind === "rename" ? receipt.result.targetSlug : "";
        const targetAdded = changes.some((candidate) =>
          candidate.status === "A" && lifecycleMetaSlug(candidate.path) === targetSlug);
        if (!targetAdded) {
          fail(`rename target lifecycle metadata is not staged as an addition: ${targetSlug}`);
          continue;
        }
        if (!renameArtifactCorrespondenceMatches(changes, subject, targetSlug)) {
          fail(`rename artifact correspondence mismatch: ${subject} -> ${targetSlug}`);
          continue;
        }
        if (receipt.transitionPatchDigest !== stagedPatchDigest) {
          fail(`rename finalized record patch digest mismatch for: ${subject}`);
          continue;
        }
        covered.add(subject);
        continue;
      }
      if (change.status === "A"
        && readHeadBytes(change.path) === null
        && receipt.transitionPatchDigest === stagedPatchDigest) {
        covered.add(receipt.subject.name);
      }
    } catch {
      continue;
    }
  }
  return { covered, failedSubjects, errors };
}

function renameArtifactCorrespondenceMatches(
  changes: readonly StagedPathChange[],
  sourceSlug: string,
  targetSlug: string,
): boolean {
  const sourceMatcher = artifactMatcher(sourceSlug);
  const targetMatcher = artifactMatcher(targetSlug);
  const sourcePrefixes = changes
    .filter((change) => change.status === "D" && sourceMatcher.test(basename(change.path)))
    .map((change) => basename(change.path).slice(0, -`-${sourceSlug}.md`.length))
    .sort();
  const targetPrefixes = changes
    .filter((change) => change.status === "A" && targetMatcher.test(basename(change.path)))
    .map((change) => basename(change.path).slice(0, -`-${targetSlug}.md`.length))
    .sort();
  return sourcePrefixes.length === targetPrefixes.length
    && sourcePrefixes.every((prefix, index) => prefix === targetPrefixes[index]);
}

function hasPreparedDecomposeRecord(
  changes: readonly StagedPathChange[],
  readIndexBytes: DecomposeCommitGateInput["readIndexBytes"],
): boolean {
  for (const change of changes) {
    if (!RECORD_PATTERN.test(change.path)) continue;
    const bytes = readIndexBytes(change.path);
    if (bytes === null) continue;
    try {
      const record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
      if (record.kind === "prepared-decompose") return true;
    } catch {
      continue;
    }
  }
  return false;
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  return Buffer.from(left).equals(Buffer.from(right));
}

function novelMergeChanges(input: DecomposeCommitGateInput): readonly StagedPathChange[] {
  if (input.mergeInProgress !== true) return input.changes;
  return input.changes.filter((change) => {
    const resultBytes = change.status === "D" ? null : input.readIndexBytes(change.path);
    if (change.status !== "D" && resultBytes === null) return true;
    const parentBytes = input.readParentBytes?.(change.path);
    if (parentBytes === undefined || parentBytes.length < 2) return true;
    return !parentBytes.some((bytes) => bytesEqual(resultBytes, bytes));
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function expectedV3Changes(receipt: V3DecomposeReceipt, recordPath: string): StagedPathChange[] {
  return [
    { status: "A", path: recordPath } satisfies StagedPathChange,
    ...receipt.finalized.transitionPatch.map(({ path, before, after }): StagedPathChange => ({
      status: before.kind === "absent" ? "A" : after.kind === "absent" ? "D" : "M",
      path,
    })),
  ].sort((left, right) => compareUtf8(left.path, right.path));
}

function sameChanges(
  left: readonly StagedPathChange[],
  right: readonly StagedPathChange[],
): boolean {
  const orderedLeft = [...left].sort((a, b) => compareUtf8(a.path, b.path));
  return canonicalize(orderedLeft) === canonicalize(right);
}

function decodeV3Record(
  change: StagedPathChange,
  readIndexBytes: DecomposeCommitGateInput["readIndexBytes"],
): V3DecomposeReceipt | null {
  const bytes = readIndexBytes(change.path);
  if (bytes === null) return null;
  try {
    return parseV3DecomposeReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function validateV3CommitAddition(
  input: DecomposeCommitGateInput,
  changes: readonly StagedPathChange[],
  recordChanges: readonly StagedPathChange[],
): string[] | null {
  const malformedV3 = recordChanges.some((change) => {
    const bytes = input.readIndexBytes(change.path);
    if (bytes === null) return false;
    try {
      const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
      return typeof value === "object" && value !== null && !Array.isArray(value)
        && (value as Record<string, unknown>).kind === "decompose-receipt"
        && (value as Record<string, unknown>).schemaVersion === 3
        && decodeV3Record(change, (path) => input.readIndexBytes(path)) === null;
    } catch {
      return false;
    }
  });
  if (malformedV3) return ["v3 decompose retirement record is malformed"];
  const decoded = recordChanges.flatMap((change) => {
    const receipt = decodeV3Record(change, (path) => input.readIndexBytes(path));
    return receipt === null ? [] : [{ change, receipt }];
  });
  if (decoded.length === 0) return null;
  if (decoded.length !== 1 || recordChanges.length !== 1) {
    return ["v3 decompose write set must carry exactly one retirement record"];
  }
  const candidate = decoded[0];
  if (candidate === undefined) return ["v3 decompose retirement record is missing"];
  const { change, receipt } = candidate;
  if (change.status !== "A" || input.readHeadBytes(change.path) !== null) {
    return ["v3 decompose retirement record already exists or was amended"];
  }
  if (change.path !== v3DecomposeReceiptPath(receipt.receiptId)) {
    return ["v3 decompose retirement record identity does not match its deterministic path"];
  }
  if (!sameChanges(changes, expectedV3Changes(receipt, change.path))) {
    return ["v3 decompose exact write set contains a rider or path-status mismatch"];
  }
  if (input.resolveRef === undefined
    || input.readPathState === undefined
    || input.readSourceArtifactInventory === undefined) {
    return ["v3 decompose canonical validation evidence is unavailable"];
  }
  const preparation: V3DecomposePreparation = {
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  };
  const machine = preparation.facts.completedMap.machine;
  if (input.resolveRef(machine.source.ref) !== machine.source.head
    || input.resolveRef(machine.resultBase.ref) !== machine.resultBase.head) {
    return ["v3 decompose canonical validation mismatch: base"];
  }
  const sourceArtifactInventory = input.readSourceArtifactInventory(preparation);
  if (sourceArtifactInventory === null) {
    return ["v3 decompose canonical validation mismatch: source"];
  }
  const sourceArtifactDigest = v3SourceArtifactDigest([...sourceArtifactInventory]);
  if (sourceArtifactDigest === null) {
    return ["v3 decompose canonical validation mismatch: source"];
  }
  const managedPathResults = receipt.finalized.managedPathResults.map(({ path }) => ({
    path,
    before: input.readPathState?.(machine.resultBase.head, path) ?? { kind: "absent" as const },
    after: input.readPathState?.(null, path) ?? { kind: "absent" as const },
  }));
  const transitionPatch = managedPathResults.filter(({ before, after }) =>
    canonicalize(before) !== canonicalize(after));
  const validation = validateFinalizedV3Decomposition({
    preparation,
    receipt,
    sourceArtifactDigest,
    sourceArtifactInventory,
    sourceUnits: machine.sourceUnits,
    sourceAllocations: preparation.facts.completedMap.authoring.sourceAllocations,
    resultBaseHead: machine.resultBase.head,
    candidateOwnership: preparation.facts.candidateOwnership,
    destinationOutputs: receipt.finalized.destinationDigests.map(
      ({ destinationId, outputs }) => ({ destinationId, outputs }),
    ),
    incomingEdges: machine.incomingEdges,
    outgoingEdges: machine.outgoingEdges,
    managedPathResults,
    transitionPatch,
    topology: preparation.facts.topology,
    publication: receipt.finalized.publication,
  });
  return validation.status === "validated"
    ? []
    : [
        `v3 decompose canonical validation mismatch: ${validation.mismatch.kind}`
        + (validation.mismatch.locus === undefined ? "" : `: ${validation.mismatch.locus}`),
      ];
}

/**
 * Whether one forbidden-namespace change is the legacy-receipt migration rather than a violation.
 *
 * Only a deletion qualifies, and only when the identical bytes are present at the canonical
 * namespace in the same index. That keeps the guard's evidence-destruction bite — a bare removal
 * still fails — while letting a branch that predates the relocation carry its receipts across.
 */
function migratesToCanonicalNamespace(
  change: StagedPathChange,
  input: DecomposeCommitGateInput,
): boolean {
  if (change.status !== "D") return false;
  const leaf = change.path.slice(`${FORBIDDEN_ROOT_INTERNAL_NAMESPACE}/`.length);
  if (leaf === "" || !leaf.startsWith("retirement-receipts/")) return false;
  const preserved = input.readIndexBytes(
    `${RETIREMENT_RECORD_NAMESPACE}/${leaf.slice("retirement-receipts/".length)}`,
  );
  return preserved !== null && bytesEqual(preserved, input.readHeadBytes(change.path));
}

/** Validate the staged decompose record and exact non-record patch. */
export function validateDecomposeCommitGate(input: DecomposeCommitGateInput): string[] {
  const forbidden = input.changes.find((change) =>
    (change.path === FORBIDDEN_ROOT_INTERNAL_NAMESPACE
      || change.path.startsWith(`${FORBIDDEN_ROOT_INTERNAL_NAMESPACE}/`))
    && !migratesToCanonicalNamespace(change, input));
  if (forbidden !== undefined) {
    return [`root-level ARC internal namespace is forbidden: ${forbidden.path}`];
  }
  const candidateChanges = novelMergeChanges(input);
  const changes = candidateChanges;
  const errors: string[] = [];
  const recordChanges = changes.filter((change) => RECORD_PATTERN.test(change.path));
  if (input.mergeInProgress === true && recordChanges.length > 0) {
    return ["merge commits cannot introduce retirement records; finalize the merge before retiring lifecycle state"];
  }
  if (hasPreparedDecomposeRecord(recordChanges, (path) => input.readIndexBytes(path))) {
    return ["decompose record is prepared but not finalized"];
  }
  const v3Errors = validateV3CommitAddition(input, changes, recordChanges);
  if (v3Errors !== null) return v3Errors;
  const coverage = receiptCoveredRetirements(
    changes,
    (path) => input.readIndexBytes(path),
    (path) => input.readHeadBytes(path),
  );
  errors.push(...coverage.errors);
  const uncovered = apparentlyRetiredSlugs(changes).filter((slug) =>
    !coverage.covered.has(slug) && !coverage.failedSubjects.has(slug));
  if (uncovered.length > 0) {
    errors.push(`lifecycle retirement is missing a finalized retirement record for: ${uncovered.join(", ")}`);
  }
  if (errors.length > 0) return errors;
  if (recordChanges.length === 0) {
    return errors;
  }
  if (recordChanges.length > 1) {
    let decomposeRecords = 0;
    for (const change of recordChanges) {
      const bytes = input.readIndexBytes(change.path);
      if (bytes === null) continue;
      try {
        const record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
        const result = record.result as Record<string, unknown> | undefined;
        if (record.transition === "decompose" && result?.kind === "decompose") decomposeRecords += 1;
      } catch {
        continue;
      }
    }
    return decomposeRecords === 0 ? [] : ["decompose write set must carry exactly one retirement record"];
  }
  const recordChange = recordChanges[0];
  if (recordChange === undefined) return ["decompose retirement record is missing"];
  const bytes = input.readIndexBytes(recordChange.path);
  if (bytes === null) return ["decompose retirement record is absent from the staged index"];
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
  } catch {
    return ["decompose retirement record is not valid UTF-8 JSON"];
  }
  const result = record.result as Record<string, unknown> | undefined;
  if (record.transition !== "decompose" || result?.kind !== "decompose") {
    return [];
  }
  if (recordChange.status !== "A" || input.readHeadBytes(recordChange.path) !== null) {
    errors.push("decompose retirement record already exists or was amended");
    return errors;
  }
  if (record.schemaVersion !== 1 && record.schemaVersion !== 2) {
    return ["decompose retirement record is not a finalized decompose receipt"];
  }
  const match = RECORD_PATTERN.exec(recordChange.path);
  if (match?.[1] === undefined || !isCanonicalDigest(record.receiptId)
    || decodeRetirementRecordKey(match[1]) !== record.receiptId) {
    return ["decompose retirement record identity does not match its deterministic path"];
  }
  if (!isCanonicalDigest(record.transitionPatchDigest)) {
    return ["decompose retirement record has an invalid transition patch digest"];
  }
  const operations: PatchOperation[] = [];
  try {
    for (const change of changes) {
      if (change.path === recordChange.path) continue;
      const path = validateManagedPath(change.path);
      if (change.status === "D") operations.push({ operation: "delete", path });
      else {
        const staged = input.readIndexBytes(change.path);
        if (staged === null) return [`staged path \`${change.path}\` is unreadable`];
        operations.push({ operation: "write", path, contentDigest: contentDigest(staged) });
      }
    }
  } catch {
    return ["decompose staged write set contains an invalid path"];
  }
  if (patchDigest(operations) !== record.transitionPatchDigest) {
    errors.push("decompose finalized record patch digest mismatch");
  }
  return errors;
}

const execFileAsync = promisify(execFile);

function pathStateKey(ref: string | null, path: string): string {
  return `${ref ?? "\0index"}\0${path}`;
}

async function gitNormalizedPathState(
  cwd: string,
  ref: string | null,
  path: string,
): Promise<V3ManagedPathResult["before"]> {
  const args = ref === null
    ? ["ls-files", "--stage", "-z", "--", `:(literal)${path}`]
    : ["ls-tree", "-z", ref, "--", `:(literal)${path}`];
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  if (stdout === "") return { kind: "absent" };
  const entries = stdout.split("\0").filter(Boolean);
  if (entries.length !== 1) {
    throw new Error(`malformed v3 decompose path state: ${path}`);
  }
  const entry = entries[0] ?? "";
  const match = ref === null
    ? /^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])\t(.+)$/u.exec(entry)
    : /^([0-7]{6}) ([^ ]+) ([0-9a-f]{40,64})\t(.+)$/u.exec(entry);
  if (match === null || match[4] !== path) {
    throw new Error(`malformed v3 decompose path state: ${path}`);
  }
  const mode = match[1];
  const objectKindOrStage = match[2];
  const stage = ref === null ? match[3] : "0";
  if ((mode !== "100644" && mode !== "100755")
    || (ref !== null && objectKindOrStage !== "blob")
    || stage !== "0") {
    throw new Error(`unsupported v3 decompose path state: ${path}`);
  }
  const bytes = await readGitBlobBytes(cwd, ref, path);
  if (bytes === null) throw new Error(`unreadable v3 decompose path state: ${path}`);
  return { kind: "file", mode, contentDigest: contentDigest(bytes) };
}

async function resolveCommit(cwd: string, ref: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--verify", `${ref}^{commit}`],
    { cwd, encoding: "utf8" },
  );
  const oid = stdout.trim();
  if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error(`cannot resolve v3 decompose ref: ${ref}`);
  return oid;
}

async function gitParentBytes(cwd: string, ref: string, path: string): Promise<Uint8Array | null> {
  const { stdout: entryOutput } = await execFileAsync(
    "git",
    ["ls-tree", `--format=%(objecttype) %(objectname)`, ref, "--", `:(literal)${path}`],
    { cwd, encoding: "utf8" },
  );
  const entries = entryOutput.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  if (entries.length === 0) return null;
  const match = entries.length === 1 ? /^blob ([0-9a-f]{40,64})$/u.exec(entries[0] ?? "") : null;
  if (match?.[1] === undefined) throw new Error(`cannot read exact merge-parent blob: ${ref}:${path}`);
  const { stdout } = await execFileAsync(
    "git",
    ["cat-file", "blob", match[1]],
    { cwd, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  return new Uint8Array(stdout);
}

async function readMergeHeads(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"],
    { cwd, encoding: "utf8" },
  );
  let content: string;
  try {
    content = await readFile(stdout.trim(), "utf8");
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return [];
    throw error;
  }
  const heads = content.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  if (heads.length === 0 || heads.some((head) => !/^[0-9a-f]{40,64}$/u.test(head))) {
    throw new Error("MERGE_HEAD does not contain valid parent object IDs");
  }
  return heads;
}

export type V3CommitGateEvidenceSnapshot =
  | {
      status: "available";
      resolvedRefs: ReadonlyMap<string, string>;
      pathStates: ReadonlyMap<string, V3ManagedPathResult["before"]>;
      sourceArtifactInventories: ReadonlyMap<string, readonly V3SourceArtifactEntry[]>;
    }
  | { status: "unavailable" };

/**
 * Prefetch every v3 validator dependency without allowing adapter failures to bypass the typed gate.
 *
 * @param receipts - Canonical staged v3 receipts requiring validation
 * @param deps - Exact ref and path-state readers
 * @returns A complete immutable snapshot, or typed unavailability
 */
export async function collectV3CommitGateEvidence(
  receipts: readonly V3DecomposeReceipt[],
  deps: {
    resolveRef(ref: string): Promise<string>;
    readPathState(ref: string | null, path: string): Promise<V3ManagedPathResult["before"]>;
    readSourceArtifactInventory(
      receipt: V3DecomposeReceipt,
    ): Promise<readonly V3SourceArtifactEntry[]>;
  },
): Promise<V3CommitGateEvidenceSnapshot> {
  const resolvedRefs = new Map<string, string>();
  const pathStates = new Map<string, V3ManagedPathResult["before"]>();
  const sourceArtifactInventories = new Map<string, readonly V3SourceArtifactEntry[]>();
  try {
    for (const receipt of receipts) {
      const machine = receipt.prepared.completedMap.machine;
      for (const ref of [machine.source.ref, machine.resultBase.ref]) {
        if (!resolvedRefs.has(ref)) resolvedRefs.set(ref, await deps.resolveRef(ref));
      }
      if (!sourceArtifactInventories.has(receipt.receiptId)) {
        sourceArtifactInventories.set(
          receipt.receiptId,
          await deps.readSourceArtifactInventory(receipt),
        );
      }
      const requests = [
        ...receipt.finalized.managedPathResults.flatMap(({ path }) => [
          [machine.resultBase.head, path] as const,
          [null, path] as const,
        ]),
      ];
      for (const [ref, path] of requests) {
        const key = pathStateKey(ref, path);
        if (!pathStates.has(key)) {
          pathStates.set(key, await deps.readPathState(ref, path));
        }
      }
    }
  } catch {
    return { status: "unavailable" };
  }
  return {
    status: "available",
    resolvedRefs,
    pathStates,
    sourceArtifactInventories,
  };
}

/** Validate the current index and set a failing exit code on refusal. */
export async function runDecomposeRecordValidation(): Promise<void> {
  const cwd = process.cwd();
  const mergeHeads = await readMergeHeads(cwd);
  const mergeInProgress = mergeHeads.length > 0;
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--cached", "--name-status", "--no-renames", "-z"],
    { cwd, encoding: "utf8" },
  );
  const changes = parseStagedPathChanges(stdout);
  const cachedIndex = new Map<string, Uint8Array>();
  const cachedHead = new Map<string, Uint8Array>();
  const cachedParents = new Map<string, Array<Uint8Array | null>>();
  for (const change of changes) {
    if (change.status !== "D") {
      const value = await readGitBlobBytes(cwd, null, change.path);
      if (value !== null) cachedIndex.set(change.path, value);
    }
    const head = await readGitBlobBytes(cwd, "HEAD", change.path);
    if (head !== null) cachedHead.set(change.path, head);
    if (mergeInProgress) {
      const parents = await Promise.all(
        ["HEAD", ...mergeHeads].map(async (parent) => await gitParentBytes(cwd, parent, change.path)),
      );
      cachedParents.set(change.path, parents);
      const firstParent = parents[0];
      if (firstParent !== null && firstParent !== undefined) cachedHead.set(change.path, firstParent);
    }
  }
  const receipts: V3DecomposeReceipt[] = [];
  for (const change of changes) {
    if (!RECORD_PATTERN.test(change.path)) continue;
    const bytes = cachedIndex.get(change.path);
    if (bytes === undefined) continue;
    let receipt: V3DecomposeReceipt | null;
    try {
      receipt = parseV3DecomposeReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      receipt = null;
    }
    if (receipt === null) continue;
    receipts.push(receipt);
  }
  const evidence = await collectV3CommitGateEvidence(receipts, {
    resolveRef: async (ref) => await resolveCommit(cwd, ref),
    readPathState: async (ref, path) => await gitNormalizedPathState(cwd, ref, path),
    readSourceArtifactInventory: async (receipt) => {
      const machine = receipt.prepared.completedMap.machine;
      const sourceSnapshot = await readGitV3DecomposeTreeSnapshot({
        cwd,
        exec: async (command, args, options) => {
          const result = await execFileAsync(command, args, {
            cwd: options?.cwd,
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
          });
          return { stdout: result.stdout, stderr: result.stderr };
        },
        readBlob: async (ref, path) => await readGitBlobBytes(cwd, ref, path),
      }, machine.source.ref, machine.source.head, machine.source.origin);
      return sourceSnapshot.sourceArtifacts.map((artifact) => ({
        path: artifact.path,
        objectKind: artifact.objectKind,
        mode: artifact.mode,
        contentDigest: contentDigest(artifact.bytes),
      }));
    },
  });
  const errors = validateDecomposeCommitGate({
    changes,
    mergeInProgress,
    readIndexBytes: (path) => cachedIndex.get(path) ?? null,
    readHeadBytes: (path) => cachedHead.get(path) ?? null,
    readParentBytes: (path) => cachedParents.get(path) ?? [],
    ...(evidence.status === "unavailable"
      ? {}
      : {
          resolveRef: (ref: string) => evidence.resolvedRefs.get(ref) ?? null,
          readPathState: (ref: string | null, path: string) => {
            const state = evidence.pathStates.get(pathStateKey(ref, path));
            if (state === undefined) {
              throw new Error(`v3 decompose evidence snapshot omitted ${ref ?? "index"}:${path}`);
            }
            return state;
          },
          readSourceArtifactInventory: (preparation: V3DecomposePreparation) =>
            evidence.sourceArtifactInventories.get(preparation.receiptId) ?? null,
        }),
  });
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  }
}

const modulePath = fileURLToPath(import.meta.url);
function realPathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

const invokedPath = process.argv[1];
const resolvedModulePath = realPathOrNull(modulePath);
if (invokedPath !== undefined
  && resolvedModulePath !== null
  && resolvedModulePath === realPathOrNull(invokedPath)
  && basename(modulePath).startsWith("validate-decompose-record.")) {
  void runDecomposeRecordValidation().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
