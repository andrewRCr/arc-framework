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
  readTreeEntries,
  readTreeEntriesDiscriminating,
  hashBlob,
  type ErrandRecordIO,
  type ErrandRecordReadIO,
} from "./ref-tree.js";
import { writeTreeWithCasRetry } from "../user-sync/cas-retry.js";

import type { GitExec } from "../git/exec.js";

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
export interface ErrandRecord {
  /** Schema version — bumped on a shape change; reads tolerate and normalize. */
  version: 1;
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
 * Serialize a record to its blob form — a normalized field order so a
 * round-trip (and a same-slug re-write) is byte-stable, which the per-slug
 * tree-merge relies on to treat identical records as idempotent.
 */
export function serializeErrandRecord(record: ErrandRecord): string {
  const normalized: ErrandRecord = {
    version: 1,
    slug: record.slug,
    origin: record.origin,
    intent: record.intent,
    branch: record.branch,
    createdAt: record.createdAt,
    ...(record.originEntry !== undefined ? { originEntry: record.originEntry } : {}),
  };
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
    record.version !== 1
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

  return {
    version: 1,
    slug: record.slug,
    origin: record.origin,
    intent: record.intent,
    branch: record.branch,
    createdAt: record.createdAt,
    ...(isNonEmptyString(record.originEntry) ? { originEntry: record.originEntry } : {}),
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Read one errand record by slug, or `null` when the ref or the slug is absent.
 *
 * @param io - Injected git seams and identity.
 * @param slug - The errand slug keying the record in the ref's tree.
 * @returns The parsed record, or `null` when missing or unparseable.
 */
export async function readErrandRecord(
  io: ErrandRecordReadIO,
  slug: string,
): Promise<ErrandRecord | null> {
  const ref = errandsRef(io.identity);
  let blob: string;
  try {
    const { stdout } = await io.exec("git", ["cat-file", "-p", `${ref}:${slug}`]);
    blob = stdout;
  } catch {
    return null;
  }
  return deserializeErrandRecord(blob);
}

/**
 * List every errand record present in the ref, in git's tree order. An absent
 * or empty ref yields an empty array; an entry that fails to parse is skipped.
 *
 * @param io - Injected git seams and identity.
 * @returns The records held in the ref's tree.
 */
export async function listErrandRecords(io: ErrandRecordReadIO): Promise<ErrandRecord[]> {
  const entries = await readTreeEntries(io.exec, errandsRef(io.identity));
  const records: ErrandRecord[] = [];
  for (const slug of entries.keys()) {
    const record = await readErrandRecord(io, slug);
    if (record !== null) records.push(record);
  }
  return records;
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
