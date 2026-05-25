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

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { atomicWriteJson } from "../fs.js";

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
