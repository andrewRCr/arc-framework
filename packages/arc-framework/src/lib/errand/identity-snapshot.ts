/** Complete, tip-pinned reads of the transient identity tree. */

import type { GitExec } from "../git/exec.js";
import { gitFailureText } from "../git/process-error.js";
import { MAX_LOCUS_JSON_BYTES, type LocusIdentityV1 } from "../locus/schema/index.js";
import {
  deserializeTransientIdentityRecord,
  projectLocusIdentity,
  type TransientIdentityRecord,
} from "./identity-record.js";
import { errandsRef } from "./ref-tree.js";

/** Injected boundary for one identity-tree snapshot. */
export interface IdentitySnapshotIO {
  readonly exec: GitExec;
  readonly identity: string;
}

/** Invalid entries retained without making an otherwise complete scan disappear. */
export type IdentitySnapshotDiagnostic =
  | { kind: "malformed"; key: string; message: string }
  | { kind: "oversized"; key: string; declaredBytes: number }
  | { kind: "unreadable"; key: string; message: string }
  | { kind: "unknown-version"; key: string; version: unknown }
  | { kind: "key-mismatch"; key: string; slug: string };

/** Exact snapshot outcome; only `complete` is a safe mutation basis. */
export type TransientIdentitySnapshot =
  | { kind: "absent" }
  | { kind: "error"; stage: "tip" | "tree"; message: string }
  | {
      kind: "complete";
      tip: string;
      records: ReadonlyMap<string, TransientIdentityRecord>;
      projections: ReadonlyMap<string, LocusIdentityV1>;
      diagnostics: readonly IdentitySnapshotDiagnostic[];
    };

interface TreeBlobEntry {
  readonly key: string;
  readonly oid: string;
  readonly size: number;
}

/**
 * Read the identity ref at one immutable commit and preserve all entry failures.
 *
 * @param io - Identity plus injected Git process boundary.
 * @returns Clean absence, a root-level failure, or the complete pinned snapshot.
 */
export async function readTransientIdentitySnapshot(
  io: IdentitySnapshotIO,
): Promise<TransientIdentitySnapshot> {
  const ref = errandsRef(io.identity);
  let tip: string;
  try {
    const result = await io.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
    tip = result.stdout.trim();
  } catch (error) {
    if (isAbsentRefFailure(gitFailureText(error))) return { kind: "absent" };
    return { kind: "error", stage: "tip", message: errorMessage(error) };
  }
  if (!isGitOid(tip)) {
    return { kind: "error", stage: "tip", message: "Identity ref resolved to an invalid commit OID" };
  }

  let entries: TreeBlobEntry[];
  try {
    const { stdout } = await io.exec("git", ["ls-tree", "--full-tree", "-z", "-l", tip]);
    entries = parseStrictRootTree(stdout);
  } catch (error) {
    return { kind: "error", stage: "tree", message: errorMessage(error) };
  }

  const records = new Map<string, TransientIdentityRecord>();
  const projections = new Map<string, LocusIdentityV1>();
  const diagnostics: IdentitySnapshotDiagnostic[] = [];
  for (const entry of entries) {
    if (entry.size > MAX_LOCUS_JSON_BYTES) {
      diagnostics.push({ kind: "oversized", key: entry.key, declaredBytes: entry.size });
      continue;
    }

    let blob: string;
    try {
      ({ stdout: blob } = await io.exec("git", ["cat-file", "blob", entry.oid]));
    } catch (error) {
      diagnostics.push({ kind: "unreadable", key: entry.key, message: errorMessage(error) });
      continue;
    }
    const actualBytes = Buffer.byteLength(blob);
    if (actualBytes > MAX_LOCUS_JSON_BYTES) {
      diagnostics.push({ kind: "oversized", key: entry.key, declaredBytes: actualBytes });
      continue;
    }
    if (actualBytes !== entry.size) {
      diagnostics.push({
        kind: "unreadable",
        key: entry.key,
        message: `Blob size changed: tree declares ${entry.size} bytes, read ${actualBytes}`,
      });
      continue;
    }

    const decoded = deserializeTransientIdentityRecord(blob, entry.key);
    if (decoded.kind === "valid") {
      records.set(entry.key, decoded.record);
      if (decoded.record.version === 3) {
        projections.set(entry.key, projectLocusIdentity(decoded.record));
      }
    } else {
      diagnostics.push({ key: entry.key, ...decoded });
    }
  }

  return { kind: "complete", tip, records, projections, diagnostics };
}

function parseStrictRootTree(stdout: string): TreeBlobEntry[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw new Error("Identity tree enumeration is not NUL-terminated");
  const entries: TreeBlobEntry[] = [];
  const keys = new Set<string>();
  for (const rawEntry of stdout.slice(0, -1).split("\0")) {
    const match = /^(\d{6}) ([^ ]+) ([0-9a-f]{40}|[0-9a-f]{64}) ([0-9]+)\t([^\0]+)$/u.exec(rawEntry);
    if (match === null) throw new Error("Identity tree contains a malformed entry");
    const [, mode, type, oid, sizeText, key] = match;
    if (mode !== "100644" || type !== "blob" || oid === undefined || sizeText === undefined || key === undefined) {
      throw new Error("Identity tree root must contain only regular blobs");
    }
    if (keys.has(key)) throw new Error(`Identity tree contains duplicate key: ${key}`);
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size)) throw new Error(`Identity tree contains invalid blob size: ${key}`);
    keys.add(key);
    entries.push({ key, oid, size });
  }
  return entries;
}

function isGitOid(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function isAbsentRefFailure(message: string): boolean {
  return /Needed a single revision|unknown revision|ambiguous argument|Not a valid object name/iu.test(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
