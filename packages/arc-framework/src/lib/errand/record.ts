/**
 * The errand record model and the orphan state-ref read/write primitives.
 *
 * An errand's logical identity lives in a record, not in its branch — the
 * branch is a projection of the record, never the identity oracle. The records
 * are held in a dedicated orphan state-ref, `refs/arc/user/{identity}/errands`,
 * as a tree of per-slug blobs: each entry is keyed by the errand `<slug>` and
 * holds that errand's serialized record. The ref is **records-only** — nothing
 * is materialized into the working tree (no `.arc/user/{identity}/errands/`
 * directory); records are read and written straight through git plumbing
 * (see {@link module:lib/errand/ref-tree}).
 *
 * @module
 */

import {
  errandsRef,
  readTreeEntriesDiscriminating,
  hashBlob,
  type ErrandRecordIO,
  type ErrandRecordReadIO,
} from "./ref-tree.js";
import { writeTreeWithCasRetry } from "../user-sync/cas-retry.js";
import {
  assertTransientIdentityOperation,
  type TransientIdentityRecord,
  type TransientIdentityOperation,
  type TransientIdentityRecordV3,
} from "./identity-record.js";
import {
  readTransientIdentitySnapshot,
  type IdentitySnapshotDiagnostic,
} from "./identity-snapshot.js";

import type { GitExec } from "../git/exec.js";
import type { TransientWorktreeSubject } from "../git/worktree-marker.js";

/**
 * How an errand came to be — the discriminator carried uniformly by every
 * record. `description` is a free-text launch (`arc-session --errand <desc>`
 * or a warm `arc-errand`); `inbox` is a promoted `USER-INBOX` capture, which
 * additionally carries an {@link ErrandRecord.originEntry} back-pointer.
 */
export type ErrandOrigin = "description" | "inbox";

/**
 * An errand's durable identity record — minted at launch, synced as a blob in
 * the orphan state-ref, projected onto a branch. Uniform across origins: an
 * inbox-promoted errand and a free-description errand differ only in whether
 * {@link originEntry} is present.
 */
interface ErrandRecordFields {
  /** The errand's stable slug — its logical identity and the tree key. */
  slug: string;
  /** How the errand originated (and whether an inbox back-pointer is present). */
  origin: ErrandOrigin;
  /** Free-text statement of the errand's concern. */
  intent: string;
  /** The branch projecting this errand (`chore/<slug>` today; nature-typed later). */
  branch: string;
  /** ISO-8601 launch timestamp. */
  createdAt: string;
  /** Originating `USER-INBOX` entry slug — present only when `origin === "inbox"`. */
  originEntry?: string;
}

/**
 * Any supported errand record schema version. Version 2 records may carry the
 * branch to restore when close reaps the errand; version 1 records cannot.
 */
export type ErrandRecord =
  | (ErrandRecordFields & { version: 1 })
  | (ErrandRecordFields & { version: 2; returnBranch?: string });

/**
 * Serialize a record to its blob form — a normalized field order so a
 * round-trip (and a same-slug re-write) is byte-stable, which the per-slug
 * tree-merge relies on to treat identical records as idempotent.
 */
export function serializeErrandRecord(record: ErrandRecord): string {
  const fields: ErrandRecordFields = {
    slug: record.slug,
    origin: record.origin,
    intent: record.intent,
    branch: record.branch,
    createdAt: record.createdAt,
    ...(record.originEntry !== undefined ? { originEntry: record.originEntry } : {}),
  };
  const normalized: ErrandRecord = record.version === 2
    ? {
      version: 2,
      ...fields,
      ...(record.returnBranch !== undefined ? { returnBranch: record.returnBranch } : {}),
    }
    : { version: 1, ...fields };
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

/**
 * Parse a blob back into a record, or `null` when it is malformed — never
 * throws, mirroring the sync-state reader so a later schema validator can swap
 * in mechanically.
 */
export function deserializeErrandRecord(blob: string): ErrandRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  if (
    (record.version !== 1 && record.version !== 2)
    || !isNonEmptyString(record.slug)
    || (record.origin !== "description" && record.origin !== "inbox")
    || typeof record.intent !== "string"
    || !isNonEmptyString(record.branch)
    || !isNonEmptyString(record.createdAt)
  ) {
    return null;
  }
  // An inbox-origin record must carry its back-pointer; a description-origin one
  // must not — enforce the discriminator's contract rather than tolerate drift.
  if (record.origin === "inbox" && !isNonEmptyString(record.originEntry)) {
    return null;
  }
  if (record.origin === "description" && record.originEntry !== undefined) {
    return null;
  }
  if (record.version === 1 && record.returnBranch !== undefined) {
    return null;
  }
  if (record.version === 2 && record.returnBranch !== undefined && !isNonEmptyString(record.returnBranch)) {
    return null;
  }

  const fields: ErrandRecordFields = {
    slug: record.slug,
    origin: record.origin,
    intent: record.intent,
    branch: record.branch,
    createdAt: record.createdAt,
    ...(isNonEmptyString(record.originEntry) ? { originEntry: record.originEntry } : {}),
  };
  return record.version === 2
    ? {
      version: 2,
      ...fields,
      ...(isNonEmptyString(record.returnBranch) ? { returnBranch: record.returnBranch } : {}),
    }
    : { version: 1, ...fields };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Read one legacy errand record from a complete, tip-pinned identity snapshot.
 *
 * @param io - Injected git seams and identity.
 * @param slug - The errand slug keying the record in the ref's tree.
 * @param operation - Read-only access or the state-changing verb requesting authority.
 * @returns The parsed legacy record, or `null` only when the ref/key is proven absent.
 * @throws {ErrandRecordReadError} When the basis is incomplete, the record is v3, or a non-close mutation targets
 *   a legacy generation.
 */
/** Structured reason a legacy single-record command cannot proceed safely. */
export type ErrandRecordReadFailure =
  | { kind: "snapshot-error"; stage: "tip" | "tree"; message: string }
  | { kind: "invalid-basis"; diagnostics: readonly IdentitySnapshotDiagnostic[] }
  | {
      kind: "legacy-close-only";
      operation: Exclude<TransientIdentityOperation, "close" | "read">;
      record: ErrandRecord;
    }
  | { kind: "current-record"; operation: TransientIdentityOperation; record: TransientIdentityRecordV3 };

/** Typed command-boundary failure preserving why a record was not safely readable. */
export class ErrandRecordReadError extends Error {
  readonly failure: ErrandRecordReadFailure;

  constructor(failure: ErrandRecordReadFailure) {
    super(messageForReadFailure(failure));
    this.name = "ErrandRecordReadError";
    this.failure = failure;
  }
}

export async function readErrandRecord(
  io: ErrandRecordReadIO,
  slug: string,
  operation: TransientIdentityOperation = "read",
): Promise<ErrandRecord | null> {
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "absent") return null;
  if (snapshot.kind === "error") {
    throw new ErrandRecordReadError({
      kind: "snapshot-error",
      stage: snapshot.stage,
      message: snapshot.message,
    });
  }
  if (snapshot.diagnostics.length > 0) {
    throw new ErrandRecordReadError({ kind: "invalid-basis", diagnostics: snapshot.diagnostics });
  }
  const record = snapshot.records.get(slug);
  if (record === undefined) return null;
  try {
    assertTransientIdentityOperation(record, operation);
  } catch {
    if (record.version === 3 || operation === "close" || operation === "read") {
      throw new Error("unreachable identity operation guard");
    }
    throw new ErrandRecordReadError({ kind: "legacy-close-only", operation, record });
  }
  if (record.version === 3) {
    throw new ErrandRecordReadError({ kind: "current-record", operation, record });
  }
  return record;
}

function messageForReadFailure(failure: ErrandRecordReadFailure): string {
  switch (failure.kind) {
    case "snapshot-error": return `Errand identity ${failure.stage} read failed: ${failure.message}`;
    case "invalid-basis": return "Errand identity basis contains invalid entries";
    case "legacy-close-only": return `Legacy identity '${failure.record.slug}' is close-only`;
    case "current-record": return `Current identity '${failure.record.slug}' requires v3 transitions`;
  }
}

/**
 * List every errand record present in the ref, in git's tree order. An absent
 * or empty ref yields an empty array; an entry that fails to parse is skipped.
 *
 * @param io - Injected git seams and identity.
 * @returns The records held in the ref's tree.
 */
export async function listErrandRecords(io: ErrandRecordReadIO): Promise<ErrandRecord[]> {
  return (await listErrandRecordsResult(io)).records;
}

/** Result of listing errand records without collapsing read failures into absence. */
export interface ListErrandRecordsResult {
  /** Every record that was read and parsed successfully. */
  records: ErrandRecord[];
  /** True only when the tree and every listed record were read successfully. */
  complete: boolean;
  /** Soft diagnostics naming unreadable or malformed records. */
  warnings: string[];
}

/**
 * List errand records while distinguishing clean absence from incomplete reads.
 *
 * @param io - Injected git seams and identity.
 * @returns Successfully parsed records plus completeness and soft diagnostics.
 */
export async function listErrandRecordsResult(io: ErrandRecordReadIO): Promise<ListErrandRecordsResult> {
  const ref = errandsRef(io.identity);
  const tree = await readTreeEntriesDiscriminating(io.exec, ref);
  if (tree.kind === "absent") return { records: [], complete: true, warnings: [] };
  if (tree.kind === "error") {
    return {
      records: [],
      complete: false,
      warnings: [`Errand record tree read failed: ${tree.error.message}`],
    };
  }

  const records: ErrandRecord[] = [];
  const warnings: string[] = [];
  for (const slug of tree.entries.keys()) {
    let blob: string;
    try {
      ({ stdout: blob } = await io.exec("git", ["cat-file", "-p", `${ref}:${slug}`]));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Errand record \`${slug}\` read failed: ${message}`);
      continue;
    }
    const record = deserializeErrandRecord(blob);
    if (record === null) {
      warnings.push(`Errand record \`${slug}\` is malformed.`);
      continue;
    }
    records.push(record);
  }
  return { records, complete: warnings.length === 0, warnings };
}

/**
 * Read the identity's errand records into a `branch → slug` index — the
 * identity oracle the session-init probes and the in-flight derivation resolve
 * errand-ness against (a branch carrying a record is an errand, branch prefix
 * notwithstanding). A `null` identity (none resolved) yields an empty index, so
 * a caller degrades to no-errands rather than branching on identity itself.
 *
 * @param io - Injected read seam (`exec`) and the identity, which may be `null`.
 * @returns Branch→slug for every present record; empty when identity is absent or the ref is unborn.
 */
export async function readErrandSlugByBranch(
  io: { exec: GitExec; identity: string | null },
): Promise<Map<string, string>> {
  if (io.identity === null) return new Map();
  const records = await listErrandRecords({ exec: io.exec, identity: io.identity });
  return new Map(records.map((record) => [record.branch, record.slug]));
}

/** Exact branch indexes for transient in-flight classification and marker-generation joins. */
export async function readTransientInFlightIndexes(
  io: { exec: GitExec; identity: string | null },
): Promise<{
  slugByBranch: Map<string, string>;
  expectedByBranch: Map<string, TransientWorktreeSubject>;
  expectedBySlug: Map<string, TransientWorktreeSubject>;
  records: TransientIdentityRecord[];
}> {
  const slugByBranch = new Map<string, string>();
  const expectedByBranch = new Map<string, TransientWorktreeSubject>();
  const expectedBySlug = new Map<string, TransientWorktreeSubject>();
  if (io.identity === null) return { slugByBranch, expectedByBranch, expectedBySlug, records: [] };
  const snapshot = await readTransientIdentitySnapshot({ exec: io.exec, identity: io.identity });
  if (snapshot.kind === "error") return { slugByBranch, expectedByBranch, expectedBySlug, records: [] };
  if (snapshot.kind === "absent") return { slugByBranch, expectedByBranch, expectedBySlug, records: [] };
  for (const record of snapshot.records.values()) {
    if (record.version !== 3 || record.branch === null) {
      if (record.version !== 3) slugByBranch.set(record.branch, record.slug);
      continue;
    }
    slugByBranch.set(record.branch, record.slug);
    const kind = record.kind === "groom"
      ? "groom"
      : record.purpose === "housekeep-routing"
        ? "housekeep"
        : "errand";
    const subject = { kind, slug: record.slug, claimId: record.claimId } as TransientWorktreeSubject;
    expectedByBranch.set(record.branch, subject);
    expectedBySlug.set(record.slug, subject);
  }
  return { slugByBranch, expectedByBranch, expectedBySlug, records: [...snapshot.records.values()] };
}

/**
 * Write (create or replace) a record in the ref, keyed by its slug. Builds a
 * new tree carrying every existing entry plus this one, commits it onto the
 * ref's prior tip, and moves the ref — no working-tree file is touched.
 *
 * @param io - Injected git seams (including the stdin-fed writer) and identity.
 * @param record - The record to store; `record.slug` is its tree key.
 */
export async function writeErrandRecord(
  io: ErrandRecordIO,
  record: ErrandRecord,
): Promise<void> {
  const blobSha = await hashBlob(io.execInput, serializeErrandRecord(record));
  const outcome = await writeTreeWithCasRetry(
    io,
    errandsRef(io.identity),
    `errand record: write ${record.slug}`,
    (entries) => {
      entries.set(record.slug, blobSha);
      return entries;
    },
  );
  if (outcome.kind === "failed") throw outcome.error;
}

/**
 * Remove a record from the ref by slug. A no-op when the slug is absent.
 * Deliberately separable from branch teardown: `close` reaps the branch around
 * it, while promotion removes the record but keeps the renamed branch.
 *
 * @param io - Injected git seams and identity.
 * @param slug - The slug to drop from the ref's tree.
 */
export async function removeErrandRecord(io: ErrandRecordIO, slug: string): Promise<void> {
  const ref = errandsRef(io.identity);
  // Pre-check the no-op case so an absent slug never writes a redundant commit;
  // the retry frame re-reads the tree, so the delete still applies to fresh state.
  // Discriminate a genuine read failure from a legitimately absent ref — a fail-open
  // read would treat an errored tree as empty and return success without removing an
  // existing record.
  const precheck = await readTreeEntriesDiscriminating(io.exec, ref);
  if (precheck.kind === "error") throw precheck.error;
  if (precheck.kind === "absent" || !precheck.entries.has(slug)) return;
  const outcome = await writeTreeWithCasRetry(io, ref, `errand record: remove ${slug}`, (entries) => {
    entries.delete(slug);
    return entries;
  });
  if (outcome.kind === "failed") throw outcome.error;
}
