/**
 * Compaction seed emitter.
 *
 * Composes the session-init envelope with a small live git slice to emit the
 * machine-local seed used after harness compaction. The helper absorbs read and
 * write failures into result objects so hook callers can exit 0 and never block
 * compaction.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaFile } from "../active/meta-reader.js";
import { atomicWriteJson } from "../fs.js";
import type { GitExec } from "../git/index.js";
import type { LoadSetManifest } from "../load-set/types.js";
import type { TaskListCursorResult } from "../task-list/cursor.js";
import {
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
  }>;
  loadSet: SeedProbe<LoadSetManifest>;
  taskCursor?: SeedProbe<TaskListCursorResult>;
}

/** Options for emitting the compaction seed. */
export interface EmitCompactionSeedOptions {
  cwd: string;
  envelope: CompactionSeedEnvelope;
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  writeSeed?: (path: string, seed: CompactionSeed) => Promise<void>;
  now?: () => Date;
}

/** Result of a seed write attempt. */
export type EmitCompactionSeedResult =
  | { status: "written"; path: string; seed: CompactionSeed }
  | { status: "skipped"; reason: "identity-missing" | "load-set-unresolved" }
  | {
    status: "failed";
    reason: "git-failed" | "identity-invalid" | "meta-read-failed" | "write-failed";
    message: string;
  };

/** Resolve the fixed seed path for an identity. */
export function resolveCompactionSeedPath(ctx: { cwd: string; identity: string }): string {
  if (
    ctx.identity === ""
    || ctx.identity === "."
    || ctx.identity === ".."
    || ctx.identity.includes(":")
    || /[\\/]/u.test(ctx.identity)
  ) {
    throw new Error(`Invalid compaction seed identity: ${ctx.identity}`);
  }
  return join(ctx.cwd, ".arc", "user", ctx.identity, ".internal", "compaction-seed.json");
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
    if (path.length > 0) paths.push(path);
    if (status.includes("R") || status.includes("C")) index++;
  }

  return [...new Set(paths)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
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
    path = resolveCompactionSeedPath({ cwd: options.cwd, identity });
  } catch (err) {
    return { status: "failed", reason: "identity-invalid", message: errorMessage(err) };
  }

  let head: string;
  let uncommittedFiles: string[];
  try {
    const [headResult, statusResult] = await Promise.all([
      options.exec("git", ["rev-parse", "HEAD"]),
      options.exec("git", ["status", "--porcelain=v1", "-z"]),
    ]);
    head = headResult.stdout.trim();
    uncommittedFiles = parseUncommittedFiles(statusResult.stdout);
  } catch (err) {
    return { status: "failed", reason: "git-failed", message: errorMessage(err) };
  }

  const metaPath = options.envelope.active.ok ? options.envelope.active.value.path : null;
  let currentWorkflow: string | null = null;
  if (metaPath !== null) {
    let parsed: ReturnType<typeof parseMetaFile>;
    try {
      const metaContent = await options.readFile(join(options.cwd, metaPath));
      parsed = parseMetaFile(metaContent);
    } catch (err) {
      return { status: "failed", reason: "meta-read-failed", message: errorMessage(err) };
    }
    currentWorkflow = normalizeNullablePointer(parsed.currentWorkflow);
  }
  const taskCursor =
    options.envelope.active.ok
      && options.envelope.active.value.sessionType === "execution"
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
    head,
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

function normalizeNullablePointer(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "[none]") return null;
  return trimmed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
