/**
 * Reader for `arc active status` — scans `.arc/active/` for status files,
 * detects Full vs Lite layout, and parses per-WU fields into structured
 * candidates.
 *
 * The reader does filesystem work only. Mode-specific shaping (full
 * enumeration vs session-init single-path resolution) lives in the probe
 * runners that call this helper.
 *
 * @module
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { ActiveLayout, StatusFileCandidate } from "../../commands/active/types.js";

const DEFAULT_ROOT_SEGMENTS = [".arc", "active"] as const;
const LITE_FILENAME = "status.md";
const FULL_PREFIX = "status-";
const FULL_SUFFIX = ".md";

/**
 * Scan-shape under the active root.
 *
 * - `subdir` (maintainer default) — enumerate `<root>/<category>/status-*.md`.
 * - `flat` (contributor) — enumerate `<root>/status-*.md` directly; ignore subdirs.
 */
export type ActiveScanShape = "subdir" | "flat";

export interface ReadActiveCandidatesOptions {
  /**
   * Active dir relative to `cwd` as path segments. Defaults to `[".arc", "active"]`.
   * Contributor flow uses `[".arc", "user", identity, "active"]`.
   */
  rootSegments?: readonly string[];
  /** Scan shape under the active root. Defaults to `subdir`. */
  scanShape?: ActiveScanShape;
}

export interface ReaderResult {
  layout: ActiveLayout;
  candidates: StatusFileCandidate[];
  warnings: string[];
}

/**
 * Scan the active directory and return parsed status-file candidates.
 *
 * Layout detection:
 *
 * - If `<root>/status.md` exists, layout is `lite` (at most one candidate;
 *   stray subdirectory files are ignored).
 * - Otherwise, layout is `full` and enumeration depends on `scanShape`:
 *     - `subdir` (default): `<root>/<category>/status-*.md`.
 *     - `flat`: `<root>/status-*.md` directly.
 *
 * A missing root directory is not an error — returns an empty candidate set
 * with a warning naming the supplied root.
 */
export async function readActiveStatusCandidates(
  cwd: string,
  options?: ReadActiveCandidatesOptions,
): Promise<ReaderResult> {
  const rootSegments = options?.rootSegments ?? DEFAULT_ROOT_SEGMENTS;
  const scanShape: ActiveScanShape = options?.scanShape ?? "subdir";
  const activeDir = join(cwd, ...rootSegments);
  const rootDisplay = `${rootSegments.join("/")}/`;
  const warnings: string[] = [];

  let exists = false;
  try {
    const s = await stat(activeDir);
    exists = s.isDirectory();
  } catch {
    // Swallow — handled below as a warning.
  }

  if (!exists) {
    warnings.push(`${rootDisplay} not found — no active work units to enumerate.`);
    return { layout: "full", candidates: [], warnings };
  }

  const litePath = join(activeDir, LITE_FILENAME);
  let liteExists = false;
  try {
    const s = await stat(litePath);
    liteExists = s.isFile();
  } catch {
    // Missing file — treat as absent; full-layout scan runs below.
  }

  if (liteExists) {
    const candidate = await parseCandidate(cwd, litePath, warnings);
    return { layout: "lite", candidates: candidate ? [candidate] : [], warnings };
  }

  const paths = scanShape === "flat"
    ? await findFlatLayoutStatusFiles(activeDir)
    : await findSubdirLayoutStatusFiles(activeDir);
  paths.sort();

  const candidates: StatusFileCandidate[] = [];
  for (const path of paths) {
    const c = await parseCandidate(cwd, path, warnings);
    if (c) candidates.push(c);
  }

  return { layout: "full", candidates, warnings };
}

async function findSubdirLayoutStatusFiles(activeDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(activeDir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(activeDir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (!s.isDirectory()) continue;
    let inner: string[];
    try {
      inner = await readdir(full);
    } catch {
      continue;
    }
    for (const name of inner) {
      if (name.startsWith(FULL_PREFIX) && name.endsWith(FULL_SUFFIX)) {
        out.push(join(full, name));
      }
    }
  }
  return out;
}

async function findFlatLayoutStatusFiles(activeDir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(activeDir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.startsWith(FULL_PREFIX) || !entry.endsWith(FULL_SUFFIX)) continue;
    const full = join(activeDir, entry);
    let s;
    try {
      s = await stat(full);
    } catch {
      continue;
    }
    if (!s.isFile()) continue;
    out.push(full);
  }
  return out;
}

async function parseCandidate(
  cwd: string,
  absPath: string,
  warnings: string[],
): Promise<StatusFileCandidate | null> {
  let content: string;
  try {
    content = await readFile(absPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Unable to read ${relative(cwd, absPath)}: ${message}`);
    return null;
  }

  const parsed = parseStatusFile(content);
  const rel = relative(cwd, absPath).split(sep).join("/");
  const filename = rel.split("/").pop() ?? rel;
  return {
    path: rel,
    filename,
    branch: parsed.branch,
    state: parsed.state,
    nextTask: parsed.nextTask,
    taskList: parsed.taskList,
  };
}

export interface ParsedStatusFields {
  branch: string | null;
  state: string | null;
  nextTask: string | null;
  taskList: string | null;
}

/**
 * Parse the four session-init-relevant fields from a status-file body.
 *
 * Accepts both list-item (`- **Field:** value`) and bare (`**Field:** value`)
 * forms; bullets and leading whitespace are tolerated. Values are taken
 * verbatim to end of line, trimmed. Inline backticks are stripped so
 * path fields like `` `.arc/active/.../tasks-foo.md` `` round-trip as
 * plain paths.
 *
 * Returns `null` for any field whose marker isn't present — downstream
 * rendering decides how to surface missing fields.
 */
export function parseStatusFile(content: string): ParsedStatusFields {
  return {
    branch: extractField(content, "Branch"),
    state: extractField(content, "State"),
    nextTask: extractField(content, "Next Task"),
    taskList: extractField(content, "Task List"),
  };
}

function extractField(content: string, label: string): string | null {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \\t>*+-]*\\*\\*${escaped}:\\*\\*[ \\t]*(.*)$`, "m");
  const m = re.exec(content);
  if (!m || m[1] === undefined) return null;
  const raw = m[1].trim();
  if (raw === "") return null;
  return stripInlineCode(raw);
}

function stripInlineCode(value: string): string {
  // Strip `backticks` around whole tokens; preserve surrounding prose intact.
  return value.replace(/`([^`]+)`/g, "$1");
}
