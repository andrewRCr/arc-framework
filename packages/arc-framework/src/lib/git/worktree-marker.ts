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

/** Logical target a worktree was created for or terminally husked from. */
export type WorktreeSubject =
  | { kind: "work-unit"; name: string }
  | { kind: "errand"; slug: string }
  | { kind: "branch"; ref: string };

/** Terminal proof recorded after ARC detaches a worktree for safe later disposal. */
export interface WorktreeHuskStamp {
  /** Exact commit checked out when the worktree was detached. */
  sha: string;
  /** ISO-8601 timestamp of the detach transition. */
  at: string;
  /** Driver-supplied logical target completed by the transition. */
  subject: WorktreeSubject;
  /** Exact branch projection occupied immediately before detach. */
  branch: string;
}

interface WorktreeMarkerBase {
  /** ARC-created provenance; written `true` — the marker's presence is the signal. */
  spawnedByArc: boolean;
  /** Identity that created the worktree. */
  spawningIdentity: string;
  /** ISO-8601 timestamp of marker creation. */
  createdAt: string;
  /** Optional proof that ARC completed the terminal detach transition. */
  husk?: WorktreeHuskStamp;
}

/** Machine-local marker recording that ARC created a worktree. */
export type WorktreeMarker = WorktreeMarkerBase &
  (
    | { wuName: string; createdFor?: Extract<WorktreeSubject, { kind: "work-unit" }> }
    | { wuName?: never; createdFor: WorktreeSubject }
  );

/** Outcome of reading the marker: present, absent, or present-but-invalid. */
export type WorktreeMarkerReadResult =
  | { kind: "present"; marker: WorktreeMarker }
  | { kind: "absent" }
  | { kind: "malformed"; message: string; path: string };

/** Outcome of extending an existing valid marker with terminal husk proof. */
export type WorktreeHuskStampResult =
  | { kind: "stamped"; marker: WorktreeMarker }
  | Extract<WorktreeMarkerReadResult, { kind: "absent" | "malformed" }>;

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
  const wuNameValid = marker.wuName === undefined || typeof marker.wuName === "string";
  const createdForValid = marker.createdFor === undefined || isWorktreeSubject(marker.createdFor);
  const hasWuName = typeof marker.wuName === "string";
  const hasCreatedFor = isWorktreeSubject(marker.createdFor);
  const huskValid = marker.husk === undefined || isWorktreeHuskStamp(marker.husk);
  return typeof marker.spawnedByArc === "boolean"
    && wuNameValid
    && createdForValid
    && (hasWuName || hasCreatedFor)
    && ownershipIsConsistent(marker.wuName, marker.createdFor)
    && huskValid
    && typeof marker.spawningIdentity === "string"
    && typeof marker.createdAt === "string";
}

function ownershipIsConsistent(wuName: unknown, createdFor: unknown): boolean {
  if (typeof wuName !== "string" || !isWorktreeSubject(createdFor)) return true;
  return createdFor.kind === "work-unit" && createdFor.name === wuName;
}

function isWorktreeHuskStamp(value: unknown): value is WorktreeHuskStamp {
  if (typeof value !== "object" || value === null) return false;
  const husk = value as Record<string, unknown>;
  if (
    typeof husk.sha !== "string"
    || typeof husk.at !== "string"
    || !isWorktreeSubject(husk.subject)
    || typeof husk.branch !== "string"
  ) {
    return false;
  }
  return husk.subject.kind !== "branch" || husk.subject.ref === husk.branch;
}

function isWorktreeSubject(value: unknown): value is WorktreeSubject {
  if (typeof value !== "object" || value === null) return false;
  const subject = value as Record<string, unknown>;
  switch (subject.kind) {
    case "work-unit":
      return typeof subject.name === "string";
    case "errand":
      return typeof subject.slug === "string";
    case "branch":
      return typeof subject.ref === "string";
    default:
      return false;
  }
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
  /** Logical target the worktree was created to host. */
  createdFor: WorktreeSubject;
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
  const ownership = options.createdFor.kind === "work-unit"
    ? { wuName: options.createdFor.name, createdFor: options.createdFor }
    : { createdFor: options.createdFor };
  await writeWorktreeMarker(cwd, {
    spawnedByArc: true,
    ...ownership,
    spawningIdentity: options.spawningIdentity,
    createdAt: new Date(options.now ?? Date.now()).toISOString(),
  });
}

/**
 * Add terminal husk proof to an existing valid ownership marker.
 *
 * Missing and malformed markers are returned unchanged: this operation never
 * creates provenance or repairs an invalid record.
 *
 * @param cwd - Worktree root whose marker should be extended
 * @param husk - Driver-supplied terminal proof
 * @returns Whether the marker was stamped, absent, or malformed
 */
export async function stampWorktreeHusk(
  cwd: string,
  husk: WorktreeHuskStamp,
): Promise<WorktreeHuskStampResult> {
  const current = await readWorktreeMarker(cwd);
  if (current.kind !== "present") return current;

  const marker: WorktreeMarker = { ...current.marker, husk };
  await writeWorktreeMarker(cwd, marker);
  return { kind: "stamped", marker };
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
