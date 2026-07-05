/**
 * Worktree-ownership marker — a machine-local record that ARC created a given
 * worktree.
 *
 * The marker lives at `.arc/system/.internal/worktree-marker.json` and is
 * gitignored: it is machine-local and never synced (never added to notes,
 * never tracked). It is self-cleaning — it shares the worktree's lifetime, so
 * removing the worktree removes the marker. Its presence is the signal
 * consulted at every cleanup site; absence means the worktree was not
 * ARC-created and cleanup is advisory only.
 *
 * @module
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { atomicWriteJson } from "../fs.js";
import type { GitExec } from "./exec.js";

/** Machine-local marker recording that ARC created a worktree. */
export interface WorktreeMarker {
  /** ARC-created provenance; written `true` — the marker's presence is the signal. */
  spawnedByArc: boolean;
  /** Work-unit name the worktree was created to host. */
  wuName: string;
  /** Identity that created the worktree. */
  spawningIdentity: string;
  /** ISO-8601 timestamp of marker creation. */
  createdAt: string;
}

/** Outcome of reading the marker: present, absent, or present-but-invalid. */
export type WorktreeMarkerReadResult =
  | { kind: "present"; marker: WorktreeMarker }
  | { kind: "absent" }
  | { kind: "malformed"; message: string; path: string };

const MARKER_PATH_SEGMENTS = [".arc", "system", ".internal", "worktree-marker.json"] as const;
const MARKER_IGNORE_PATTERN = ".arc/system/.internal/worktree-marker.json";

/** Filesystem seam for registering the marker's Git ignore rule. */
export interface WorktreeMarkerIgnoreFs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
}

/** Production filesystem adapter for marker ignore registration. */
export const nodeWorktreeMarkerIgnoreFs: WorktreeMarkerIgnoreFs = {
  readFile: (path) => readFile(path, "utf8"),
  writeFile,
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
};

/**
 * Resolve the marker's absolute path under a worktree root. Pure path math —
 * does not touch the filesystem.
 *
 * @param cwd - Worktree root containing `.arc/`
 * @returns Absolute path to `worktree-marker.json`
 */
export function resolveWorktreeMarkerPath(cwd: string): string {
  return join(cwd, ...MARKER_PATH_SEGMENTS);
}

/**
 * Register the machine-local ownership marker in Git's exclude file.
 *
 * @param cwd - Worktree root the marker belongs to.
 * @param exec - Git executor pinned to this repository.
 * @param fs - Filesystem adapter.
 */
export async function ensureWorktreeMarkerIgnored(
  cwd: string,
  exec: GitExec,
  fs: WorktreeMarkerIgnoreFs,
): Promise<void> {
  const { stdout } = await exec("git", ["rev-parse", "--git-path", "info/exclude"], { cwd });
  const rawPath = stdout.trim();
  const excludePath = isAbsolute(rawPath) ? rawPath : resolve(cwd, rawPath);

  let content = "";
  try {
    content = await fs.readFile(excludePath);
  } catch (err) {
    if (!isNodeError(err) || err.code !== "ENOENT") throw err;
  }

  const lines = content.split(/\r?\n/u);
  if (lines.includes(MARKER_IGNORE_PATTERN)) return;

  const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
  await fs.mkdir(dirname(excludePath), { recursive: true });
  await fs.writeFile(excludePath, `${prefix}${MARKER_IGNORE_PATTERN}\n`);
}

/**
 * Runtime guard for the marker schema.
 *
 * @param value - Unverified value from parsed JSON
 * @returns Whether `value` is a well-formed {@link WorktreeMarker}
 */
export function isWorktreeMarker(value: unknown): value is WorktreeMarker {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Record<string, unknown>;
  return typeof marker.spawnedByArc === "boolean"
    && typeof marker.wuName === "string"
    && typeof marker.spawningIdentity === "string"
    && typeof marker.createdAt === "string";
}

/**
 * Write the worktree-ownership marker to its machine-local location. The
 * `.arc/system/.internal/` parent directory is created as needed.
 *
 * @param cwd - Worktree root the marker belongs to
 * @param marker - Marker contents to persist
 */
export async function writeWorktreeMarker(cwd: string, marker: WorktreeMarker): Promise<void> {
  await atomicWriteJson(resolveWorktreeMarkerPath(cwd), marker);
}

/** Inputs for {@link writeWorktreeOwnershipMarker}. */
export interface WriteWorktreeOwnershipMarkerOptions {
  /**
   * Whether ARC created this worktree. When `false`, no marker is written —
   * the worktree is externally-created and its cleanup stays advisory.
   */
  createdByArc: boolean;
  /** Work-unit name the worktree was created to host. */
  wuName: string;
  /** Identity that created the worktree. */
  spawningIdentity: string;
  /** Marker creation time in epoch millis; defaults to `Date.now()`. Injectable for tests. */
  now?: number;
}

/**
 * Write the worktree-ownership marker when ARC created the worktree, and do
 * nothing when it did not. The `createdByArc` flag is the single switch: a
 * spawn passes `true` (the marker lands, its presence the ARC-created signal),
 * a cold-start into an externally-created worktree passes `false` (no marker —
 * cleanup there is advisory). A written marker always records
 * `spawnedByArc: true`; absence, not a `false` field, is the "not ARC-created"
 * signal.
 *
 * @param cwd - Worktree root the marker belongs to
 * @param options - The created-by-arc flag plus marker context
 */
export async function writeWorktreeOwnershipMarker(
  cwd: string,
  options: WriteWorktreeOwnershipMarkerOptions,
): Promise<void> {
  if (!options.createdByArc) return;
  await writeWorktreeMarker(cwd, {
    spawnedByArc: true,
    wuName: options.wuName,
    spawningIdentity: options.spawningIdentity,
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
  });
}

/**
 * Read the worktree-ownership marker. A missing file is reported as `absent`
 * (not an error) — absence is the documented "not ARC-created" signal. A file
 * that exists but is not valid marker JSON is reported as `malformed`.
 *
 * @param cwd - Worktree root to read the marker from
 * @returns The parsed marker, `absent`, or `malformed`
 */
export async function readWorktreeMarker(cwd: string): Promise<WorktreeMarkerReadResult> {
  const path = resolveWorktreeMarkerPath(cwd);

  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (err) {
    if (isNodeError(err) && err.code === "ENOENT") {
      return { kind: "absent" };
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: "malformed", message: "worktree marker contains malformed JSON", path };
  }

  if (!isWorktreeMarker(parsed)) {
    return { kind: "malformed", message: "worktree marker does not match the expected schema", path };
  }

  return { kind: "present", marker: parsed };
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
