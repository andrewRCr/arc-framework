/** Commit-time gate requiring exact finalized evidence for decompose writes. */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { isCanonicalDigest } from "../lib/canonical/canonical-json.js";
import { contentDigest, patchDigest, type PatchOperation } from "../lib/canonical/content-digest.js";
import { validateManagedPath } from "../lib/canonical/managed-path.js";
import { receiptId } from "../lib/canonical/receipt-id.js";
import {
  decodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "../lib/work-unit/retirement-record-store.js";
import { parseRetirementReceipt } from "../lib/work-unit/retirement-receipt-codec.js";

export interface StagedPathChange {
  status: "A" | "M" | "D";
  path: string;
}

export interface DecomposeCommitGateInput {
  changes: readonly StagedPathChange[];
  /** Merge commits combine already-recorded history and do not mint lifecycle evidence. */
  mergeInProgress?: boolean;
  readIndexBytes(path: string): Uint8Array | null;
  readHeadBytes(path: string): Uint8Array | null;
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

function receiptCoveredRetirements(
  changes: readonly StagedPathChange[],
  readIndexBytes: DecomposeCommitGateInput["readIndexBytes"],
  readHeadBytes: DecomposeCommitGateInput["readHeadBytes"],
): Set<string> {
  const covered = new Set<string>();
  const recordPaths = new Set(changes.filter((change) => RECORD_PATTERN.test(change.path)).map((change) => change.path));
  const operations: PatchOperation[] = [];
  try {
    for (const change of changes) {
      if (recordPaths.has(change.path)) continue;
      const path = validateManagedPath(change.path);
      if (change.status === "D") operations.push({ operation: "delete", path });
      else {
        const staged = readIndexBytes(change.path);
        if (staged === null) return covered;
        operations.push({ operation: "write", path, contentDigest: contentDigest(staged) });
      }
    }
  } catch {
    return covered;
  }
  const stagedPatchDigest = patchDigest(operations);
  for (const change of changes) {
    const pathMatch = RECORD_PATTERN.exec(change.path);
    if (change.status !== "A" || pathMatch?.[1] === undefined || readHeadBytes(change.path) !== null) continue;
    const bytes = readIndexBytes(change.path);
    if (bytes === null) continue;
    try {
      const receipt = parseRetirementReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (receipt?.subject.kind === "work-unit"
        && (receipt.transition === "abandon" || receipt.transition === "decompose")
        && decodeRetirementRecordKey(pathMatch[1]) === receipt.receiptId
        && receipt.receiptId === receiptId({
          schemaVersion: receipt.schemaVersion,
          subject: receipt.subject,
          transition: receipt.transition,
          sourceBranch: receipt.source.branch,
          sourceHead: receipt.source.head,
        })
        && receipt.transitionPatchDigest === stagedPatchDigest) {
        covered.add(receipt.subject.name);
      }
    } catch {
      continue;
    }
  }
  return covered;
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

/** Validate the staged decompose record and exact non-record patch. */
export function validateDecomposeCommitGate(input: DecomposeCommitGateInput): string[] {
  if (input.mergeInProgress === true) return [];
  const errors: string[] = [];
  const recordChanges = input.changes.filter((change) => RECORD_PATTERN.test(change.path));
  if (hasPreparedDecomposeRecord(recordChanges, (path) => input.readIndexBytes(path))) {
    return ["decompose record is prepared but not finalized"];
  }
  const covered = receiptCoveredRetirements(
    input.changes,
    (path) => input.readIndexBytes(path),
    (path) => input.readHeadBytes(path),
  );
  const uncovered = apparentlyRetiredSlugs(input.changes).filter((slug) => !covered.has(slug));
  if (uncovered.length > 0) {
    errors.push(`lifecycle retirement is missing a finalized retirement record for: ${uncovered.join(", ")}`);
    return errors;
  }
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
  if (record.schemaVersion !== 1) {
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
    for (const change of input.changes) {
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

async function gitBytes(args: string[]): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync("git", args, { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 });
    return new Uint8Array(stdout);
  } catch {
    return null;
  }
}

/** Validate the current index and set a failing exit code on refusal. */
export async function runDecomposeRecordValidation(): Promise<void> {
  const mergeInProgress = await gitBytes(["rev-parse", "--verify", "-q", "MERGE_HEAD"]) !== null;
  if (mergeInProgress) return;
  const { stdout } = await execFileAsync(
    "git",
    ["diff", "--cached", "--name-status", "--no-renames", "-z"],
    { encoding: "utf8" },
  );
  const changes = parseStagedPathChanges(stdout);
  const errors = validateDecomposeCommitGate({
    changes,
    mergeInProgress,
    readIndexBytes: () => null,
    readHeadBytes: () => null,
  });
  for (const change of changes) {
    if (change.status !== "D") {
      const value = await gitBytes(["show", `:${change.path}`]);
      if (value !== null) cachedIndex.set(change.path, value);
    }
    const head = await gitBytes(["show", `HEAD:${change.path}`]);
    if (head !== null) cachedHead.set(change.path, head);
  }
  errors.splice(0, errors.length, ...validateDecomposeCommitGate({
    changes,
    mergeInProgress,
    readIndexBytes: (path) => cachedIndex.get(path) ?? null,
    readHeadBytes: (path) => cachedHead.get(path) ?? null,
  }));
  if (errors.length > 0) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  }
}

const cachedIndex = new Map<string, Uint8Array>();
const cachedHead = new Map<string, Uint8Array>();

const modulePath = fileURLToPath(import.meta.url);
if (modulePath === process.argv[1] && basename(modulePath).startsWith("validate-decompose-record.")) {
  void runDecomposeRecordValidation().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
