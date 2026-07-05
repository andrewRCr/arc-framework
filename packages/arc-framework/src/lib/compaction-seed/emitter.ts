/**
 * Compaction seed emitter.
 *
 * Composes the session-init envelope with the status handler's git snapshot to
 * emit the machine-local seed used after harness compaction. The helper absorbs
 * write failures into result objects so hook callers can exit 0 and never block
 * compaction.
 *
 * @module
 */

import { join } from "node:path";

import { atomicWriteJson } from "../fs.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { TaskListCursorFileResult } from "../task-list/file-cursor.js";
import {
  assertCompactionSeed,
  COMPACTION_SEED_SCHEMA_VERSION,
  type CompactionSeed,
  type CompactionSeedSessionType,
} from "./schema.js";

type SeedProbe<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

/** Minimal session-init envelope surface the seed emitter consumes. */
export interface CompactionSeedEnvelope {
  identity: { identity: string | null };
  worktree: SeedProbe<{ branch: string | null }>;
  active: SeedProbe<{
    path: string | null;
    sessionType: CompactionSeedSessionType | null;
    currentWorkflow: string | null;
  }>;
  loadSet: SeedProbe<LoadSetManifest>;
  taskCursor?: SeedProbe<TaskListCursorFileResult>;
}

/** Git state captured by the status handler for seed emission. */
export interface CompactionSeedGitSnapshot {
  /** HEAD SHA at the same status-handler snapshot used for seed emission. */
  head: string;
  /** Deterministic dirty-file path set from `git status --porcelain=v1 -z`. */
  uncommittedFiles: readonly string[];
}

/** Options for emitting the compaction seed. */
export interface EmitCompactionSeedOptions {
  cwd: string;
  envelope: CompactionSeedEnvelope;
  gitSnapshot: CompactionSeedGitSnapshot;
  writeSeed?: (path: string, seed: CompactionSeed) => Promise<void>;
  now?: () => Date;
}

/** Result of a seed write attempt. */
export type EmitCompactionSeedResult =
  | { status: "written"; path: string; seed: CompactionSeed }
  | { status: "skipped"; reason: "identity-missing" | "load-set-unresolved" }
  | {
    status: "failed";
    reason: "git-failed" | "identity-invalid" | "seed-invalid" | "write-failed";
    message: string;
  };

/**
 * Resolve the seed path for an identity, rooted at the active worktree.
 *
 * The compaction seed is per-session state, not an identity-global surface: it
 * lives under the current checkout (`cwd`), so concurrent worktrees each own a
 * private seed and one session's compaction cannot clobber another's — and the
 * seed is torn down with its worktree.
 */
export function resolveCompactionSeedPath(ctx: {
  cwd: string;
  identity: string;
}): string {
  if (isUnsafeCompactionSeedIdentity(ctx.identity)) {
    throw new Error(`Invalid compaction seed identity: ${ctx.identity}`);
  }
  return join(ctx.cwd, ".arc", "user", ctx.identity, ".internal", "compaction-seed.json");
}

function isUnsafeCompactionSeedIdentity(identity: string): boolean {
  return identity === ""
    || identity === "."
    || identity === ".."
    || identity.startsWith(".")
    || hasControlCharacter(identity)
    || /[<>:"/\\|?*]/u.test(identity)
    || /[. ]$/u.test(identity)
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(identity);
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

/** Parse `git status --porcelain=v1 -z` output into a sorted path list. */
export function parseUncommittedFiles(stdout: string): string[] {
  const records = stdout.split("\0").filter((record) => record.length > 0);
  const paths: string[] = [];

  for (let index = 0; index < records.length; index++) {
    const record = records[index] as string;
    if (record.length < 4) continue;
    const status = record.slice(0, 2);
    const path = record.slice(3);
    const normalizedPath = normalizeUncommittedPath(path);
    if (normalizedPath !== null) paths.push(normalizedPath);
    if (status.includes("R") || status.includes("C")) index++;
  }

  return canonicalizeUncommittedFiles(paths);
}

function canonicalizeUncommittedFiles(paths: readonly string[]): string[] {
  return [...new Set(paths
    .map(normalizeUncommittedPath)
    .filter((path): path is string => path !== null))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function normalizeUncommittedPath(path: string): string | null {
  const normalizedPath = path.replace(/\/+$/u, "");
  return normalizedPath.length > 0 ? normalizedPath : null;
}

/** Emit the current compaction seed to disk, returning a non-throwing result. */
export async function emitCompactionSeed(
  options: EmitCompactionSeedOptions,
): Promise<EmitCompactionSeedResult> {
  const identity = options.envelope.identity.identity;
  if (identity === null) return { status: "skipped", reason: "identity-missing" };
  if (!options.envelope.loadSet.ok) return { status: "skipped", reason: "load-set-unresolved" };

  let path: string;
  try {
    path = resolveCompactionSeedPath({
      cwd: options.cwd,
      identity,
    });
  } catch (err) {
    return { status: "failed", reason: "identity-invalid", message: errorMessage(err) };
  }

  const metaPath = options.envelope.active.ok ? options.envelope.active.value.path : null;
  const currentWorkflow = options.envelope.active.ok
    ? options.envelope.active.value.currentWorkflow
    : null;
  const uncommittedFiles = canonicalizeUncommittedFiles(options.gitSnapshot.uncommittedFiles);
  const taskCursor =
    options.envelope.active.ok
      && options.envelope.active.value.sessionType !== "planning"
      && options.envelope.taskCursor?.ok
      && options.envelope.taskCursor.value.status === "found"
      ? options.envelope.taskCursor.value.cursor
      : null;

  const seed: CompactionSeed = {
    schemaVersion: COMPACTION_SEED_SCHEMA_VERSION,
    emittedAt: (options.now ?? (() => new Date()))().toISOString(),
    repoRoot: options.cwd,
    branch: options.envelope.worktree.ok
      ? options.envelope.worktree.value.branch ?? "HEAD"
      : "HEAD",
    head: options.gitSnapshot.head,
    dirty: uncommittedFiles.length > 0,
    activeWorkUnit: activeWorkUnitName(metaPath),
    metaPath,
    sessionType: options.envelope.active.ok ? options.envelope.active.value.sessionType : null,
    currentWorkflow,
    taskCursor,
    loadSet: options.envelope.loadSet.value,
    uncommittedFiles,
  };

  try {
    assertCompactionSeed(seed);
  } catch (err) {
    return { status: "failed", reason: "seed-invalid", message: errorMessage(err) };
  }

  try {
    await (options.writeSeed ?? writeCompactionSeedFile)(path, seed);
  } catch (err) {
    return { status: "failed", reason: "write-failed", message: errorMessage(err) };
  }
  return { status: "written", path, seed };
}

async function writeCompactionSeedFile(path: string, seed: CompactionSeed): Promise<void> {
  await atomicWriteJson(path, seed);
}

function activeWorkUnitName(path: string | null): string | null {
  if (path === null) return null;
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
