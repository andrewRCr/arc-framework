/** Commit-time gate requiring exact finalized evidence for decompose writes. */

import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { isCanonicalDigest } from "../lib/canonical/canonical-json.js";
import { contentDigest, patchDigest, type PatchOperation } from "../lib/canonical/content-digest.js";
import { validateManagedPath } from "../lib/canonical/managed-path.js";
import {
  decodeRetirementRecordKey,
  RETIREMENT_RECORD_NAMESPACE,
} from "../lib/work-unit/retirement-record-store.js";

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

const RECORD_PATTERN = new RegExp(`^${RETIREMENT_RECORD_NAMESPACE}/(sha256-[0-9a-f]{64})\\.json$`, "u");

function looksLikeRecordlessRetirement(changes: readonly StagedPathChange[]): boolean {
  const deletedOrigins = changes
    .filter((change) => change.status === "D")
    .map((change) => /(^|\/)meta-([^/]+)\.md$/u.exec(change.path)?.[2])
    .filter((slug): slug is string => slug !== undefined);
  const addedTargets = changes
    .filter((change) => change.status === "A")
    .map((change) => /(^|\/)meta-([^/]+)\.md$/u.exec(change.path)?.[2])
    .filter((slug): slug is string => slug !== undefined);
  return deletedOrigins.some((origin) => !addedTargets.includes(origin));
}

/** Validate the staged decompose record and exact non-record patch. */
export function validateDecomposeCommitGate(input: DecomposeCommitGateInput): string[] {
  const errors: string[] = [];
  const recordChanges = input.changes.filter((change) => RECORD_PATTERN.test(change.path));
  if (recordChanges.length === 0) {
    if (input.mergeInProgress !== true && looksLikeRecordlessRetirement(input.changes)) {
      errors.push("lifecycle retirement is missing a finalized retirement record");
    }
    return errors;
  }
  if (recordChanges.length > 1) {
    let decomposeRecords = 0;
    for (const change of recordChanges) {
      const bytes = input.readIndexBytes(change.path);
      if (bytes === null) continue;
      try {
        const record = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as Record<string, unknown>;
        if (record.kind === "prepared-decompose") return ["decompose record is prepared but not finalized"];
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
  if (record.kind === "prepared-decompose") return ["decompose record is prepared but not finalized"];
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
  const { stdout } = await execFileAsync("git", ["diff", "--cached", "--name-status", "--no-renames"], { encoding: "utf8" });
  const changes = stdout.trim().split("\n").filter(Boolean).flatMap((line): StagedPathChange[] => {
    const [rawStatus, path] = line.split("\t");
    const status = rawStatus?.[0];
    if ((status !== "A" && status !== "M" && status !== "D") || path === undefined) return [];
    return [{ status, path }];
  });
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
