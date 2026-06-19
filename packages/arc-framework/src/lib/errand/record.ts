/**
 * The errand record model and the orphan state-ref read/write primitives.
 *
 * An errand's logical identity lives in a record, not in its branch — the
 * branch is a projection of the record, never the identity oracle. The records
 * are held in a dedicated orphan state-ref, `refs/arc/user/{identity}/errands`,
 * as a tree of per-slug blobs: each entry is keyed by the errand `<slug>` and
 * holds that errand's serialized record. The ref is **records-only** — nothing
 * is materialized into the working tree (no `.arc/user/{identity}/errands/`
 * directory); records are read and written straight through git plumbing.
 *
 * Two seams are injected. Reads (`cat-file`, `ls-tree`, `rev-parse`) run over
 * the standard {@link GitExec}; writes additionally need stdin-fed plumbing
 * (`hash-object --stdin`, `mktree`), so they take a {@link GitExecInput} seam —
 * the same split the user-notes path uses between its `exec` and its
 * spawn-backed note writer.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

/** Orphan state-ref namespace for errand records; `{identity}` is appended. */
const ERRAND_REF_PREFIX = "refs/arc/user";

/** The full errand state-ref for an identity. */
export function errandsRef(identity: string): string {
  return `${ERRAND_REF_PREFIX}/${identity}/errands`;
}

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
 * A git invocation that pipes `input` to the subprocess stdin and resolves with
 * its stdout. The stdin-fed counterpart to {@link GitExec}, for the plumbing
 * (`hash-object --stdin`, `mktree`) that builds blobs and trees.
 */
export type GitExecInput = (args: string[], input: string) => Promise<string>;

/** The injected git seams an errand-record operation runs over. */
export interface ErrandRecordIO {
  /** Standard executor for reads and non-stdin writes (`commit-tree`, `update-ref`). */
  exec: GitExec;
  /** Stdin-fed executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
  /** The identity whose errand ref is read or written. */
  identity: string;
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
  io: ErrandRecordIO,
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
export async function listErrandRecords(io: ErrandRecordIO): Promise<ErrandRecord[]> {
  const ref = errandsRef(io.identity);
  const slugs = await readTreeSlugs(io.exec, ref);
  const records: ErrandRecord[] = [];
  for (const slug of slugs) {
    const record = await readErrandRecord(io, slug);
    if (record !== null) records.push(record);
  }
  return records;
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
  const entries = await readTreeEntries(io.exec, errandsRef(io.identity));
  const next = new Map(entries);
  next.set(record.slug, blobSha);
  await commitTree(io, next, `errand record: write ${record.slug}`);
}

/**
 * Remove a record from the ref by slug. A no-op (still advances the ref to an
 * identical-tree commit is avoided) when the slug is absent. Deliberately
 * separable from branch teardown: `close` reaps the branch around it, while
 * promotion removes the record but keeps the renamed branch.
 *
 * @param io - Injected git seams and identity.
 * @param slug - The slug to drop from the ref's tree.
 */
export async function removeErrandRecord(io: ErrandRecordIO, slug: string): Promise<void> {
  const entries = await readTreeEntries(io.exec, errandsRef(io.identity));
  if (!entries.has(slug)) return;
  entries.delete(slug);
  await commitTree(io, entries, `errand record: remove ${slug}`);
}

/** Slug names present in the ref's tree, or `[]` when the ref is absent. */
async function readTreeSlugs(exec: GitExec, ref: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["ls-tree", "--name-only", ref]);
    return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Slug → blob-sha entries in the ref's tree, or empty when the ref is absent. */
async function readTreeEntries(exec: GitExec, ref: string): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["ls-tree", ref]));
  } catch {
    return entries;
  }
  for (const line of stdout.split("\n")) {
    // `<mode> SP <type> SP <sha> TAB <name>`
    const match = /^\d{6} blob ([0-9a-f]{40})\t(.+)$/u.exec(line.trimEnd());
    if (match) {
      const [, sha, slug] = match;
      if (sha && slug) entries.set(slug, sha);
    }
  }
  return entries;
}

/** Hash content into the object store as a blob, returning its sha. */
async function hashBlob(execInput: GitExecInput, content: string): Promise<string> {
  const stdout = await execInput(["hash-object", "-w", "--stdin"], content);
  return stdout.trim();
}

/**
 * Build a tree from the given slug→blob entries, commit it onto the ref's
 * current tip (no parent when the ref is new), and move the ref to it.
 */
async function commitTree(
  io: ErrandRecordIO,
  entries: Map<string, string>,
  message: string,
): Promise<void> {
  const ref = errandsRef(io.identity);
  const treeInput = [...entries.entries()]
    .map(([slug, sha]) => `100644 blob ${sha}\t${slug}`)
    .join("\n");
  const treeSha = (await io.execInput(["mktree"], `${treeInput}\n`)).trim();

  const parent = await readRefTip(io.exec, ref);
  const commitArgs = parent
    ? ["commit-tree", treeSha, "-p", parent, "-m", message]
    : ["commit-tree", treeSha, "-m", message];
  const { stdout: commitSha } = await io.exec("git", commitArgs);

  await io.exec("git", ["update-ref", ref, commitSha.trim()]);
}

/** Current commit the ref points at, or `null` when it does not resolve. */
async function readRefTip(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
