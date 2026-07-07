/**
 * Repo-shared materialized-baseline stamp for user notes.
 *
 * The stamp records the projected manifest and parsed cross-WU entry basis that
 * disk last materialized. It lives beside the notes lock in Git's common dir, so
 * sibling worktrees on the same machine agree on one identity-global baseline.
 *
 * @module
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SyncManifest } from "../git/index.js";
import type { GitExec } from "../git/exec.js";
import { atomicWriteJson } from "../fs.js";

import { parseCrossWuEntries, shapeForFile } from "./parser.js";
import { projectManifest } from "./projection.js";
import { getRepoSharedUserInternalDir } from "./repo-shared-paths.js";

const MATERIALIZED_BASELINE_FILENAME = "materialized-baseline.json";
const MATERIALIZED_BASELINE_VERSION = 1;

/** One materialized file in the projected manifest basis. */
export interface MaterializedBaselineFile {
  path: string;
  contentHash: string;
}

/** One parsed cross-WU entry identity materialized to disk. */
export interface MaterializedBaselineEntry {
  path: string;
  section: string;
  key: string;
  contentHash: string;
}

/** Schema-versioned stamp describing the identity-global disk baseline. */
export interface MaterializedBaselineStamp {
  version: 1;
  manifestHash: string;
  notesRefTip: string | null;
  files: MaterializedBaselineFile[];
  entries: MaterializedBaselineEntry[];
}

/** Absolute path to the repo-shared materialized-baseline stamp. */
export async function getMaterializedBaselineStampPath(
  exec: GitExec,
  cwd: string,
  identity: string,
): Promise<string> {
  return join(await getRepoSharedUserInternalDir(exec, cwd, identity), MATERIALIZED_BASELINE_FILENAME);
}

/** Write a fresh materialized-baseline stamp. Caller owns serialization. */
export async function writeMaterializedBaselineStamp(options: {
  exec: GitExec;
  cwd: string;
  identity: string;
  manifest: SyncManifest;
  manifestHash: string;
  notesRefTip: string | null;
}): Promise<void> {
  const stamp = buildMaterializedBaselineStamp({
    manifest: options.manifest,
    manifestHash: options.manifestHash,
    notesRefTip: options.notesRefTip,
  });
  await atomicWriteJson(
    await getMaterializedBaselineStampPath(options.exec, options.cwd, options.identity),
    stamp,
  );
}

/** Read the current materialized-baseline stamp, or null when missing/unknown. */
export async function readMaterializedBaselineStamp(
  exec: GitExec,
  cwd: string,
  identity: string,
): Promise<MaterializedBaselineStamp | null> {
  let raw: string;
  try {
    raw = await readFile(await getMaterializedBaselineStampPath(exec, cwd, identity), "utf-8");
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  return isMaterializedBaselineStamp(parsed) ? parsed : null;
}

function buildMaterializedBaselineStamp(input: {
  manifest: SyncManifest;
  manifestHash: string;
  notesRefTip: string | null;
}): MaterializedBaselineStamp {
  const projected = projectManifest(input.manifest);
  return {
    version: MATERIALIZED_BASELINE_VERSION,
    manifestHash: input.manifestHash,
    notesRefTip: input.notesRefTip,
    files: materializedFiles(projected),
    entries: materializedEntries(projected),
  };
}

function materializedFiles(manifest: SyncManifest): MaterializedBaselineFile[] {
  return Object.entries(manifest.files)
    .map(([path, content]) => ({ path, contentHash: hashContent(content) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function materializedEntries(manifest: SyncManifest): MaterializedBaselineEntry[] {
  const entries: MaterializedBaselineEntry[] = [];
  for (const [path, content] of Object.entries(manifest.files)) {
    const shape = shapeForFile(path);
    if (shape === null) continue;
    for (const parse of parseCrossWuEntries(content, shape)) {
      if (!parse.ok) continue;
      entries.push({
        path,
        section: parse.entry.section,
        key: parse.entry.key,
        contentHash: hashContent(parse.entry.raw),
      });
    }
  }
  return entries.sort((a, b) =>
    a.path.localeCompare(b.path)
    || a.section.localeCompare(b.section)
    || a.key.localeCompare(b.key)
  );
}

function isMaterializedBaselineStamp(value: unknown): value is MaterializedBaselineStamp {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === MATERIALIZED_BASELINE_VERSION
    && typeof record.manifestHash === "string"
    && (typeof record.notesRefTip === "string" || record.notesRefTip === null)
    && Array.isArray(record.files)
    && record.files.every(isMaterializedBaselineFile)
    && Array.isArray(record.entries)
    && record.entries.every(isMaterializedBaselineEntry)
  );
}

function isMaterializedBaselineFile(value: unknown): value is MaterializedBaselineFile {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.path === "string" && typeof record.contentHash === "string";
}

function isMaterializedBaselineEntry(value: unknown): value is MaterializedBaselineEntry {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === "string"
    && typeof record.section === "string"
    && typeof record.key === "string"
    && typeof record.contentHash === "string"
  );
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
