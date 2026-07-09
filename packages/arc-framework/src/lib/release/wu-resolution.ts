/**
 * Active-work-unit resolver consumed by the release commit and push
 * handlers.
 *
 * Composes {@link readActiveMetaCandidates} from the active-meta
 * reader. Accepts any `**State:**` value — Planning, In Progress,
 * Paused, etc. — and distinguishes three outcomes: a single resolved
 * WU, a zero-candidate `none` result (no active WU — handlers accept it
 * and record a null work unit), and multi-candidate `ambiguous`
 * (refused code 10, carrying a disambiguation hint).
 *
 * @module
 */

import { readActiveMetaCandidates } from "../active/meta-reader.js";

const DEFAULT_ROOT_SEGMENTS = [".arc", "active"] as const;

const MULTI_CANDIDATE_HINT =
  "Multiple status files resolved under the active root. Run session-init disambiguation to choose.";

export interface ResolveActiveWuOptions {
  cwd: string;
  /**
   * Active-root segments. Defaults to maintainer scope (`[".arc", "active"]`);
   * contributor scope is `[".arc", "user", identity, "active"]`. The eventual
   * per-WU subdir convention (`[".arc", "user", identity, "<wu-name>"]`)
   * will replace the flat `active/` subdir once contributor-lifecycle
   * support that populates per-WU contributor-meta files lands.
   */
  rootSegments?: readonly string[];
}

/**
 * Successful resolution: the unambiguous active WU.
 *
 * `path` is relative to `cwd` and matches the active-status reader's
 * shape. `name` is parsed from the meta filename; it is the empty string
 * for the lite layout (`status.md` directly under the active root), which
 * carries no parseable WU name.
 */
export interface ResolvedWu {
  path: string;
  name: string;
}

export type WuResolution =
  | ({ status: "resolved" } & ResolvedWu)
  | { status: "none" }
  | { status: "ambiguous"; hint: string };

/**
 * Resolve the unambiguous active WU under the configured active root.
 *
 * - 0 candidates → `none` (no active WU; handlers proceed and record a
 *   null work unit).
 * - 2+ candidates → `ambiguous` with disambiguation hint (handlers
 *   refuse code 10).
 * - 1 candidate → resolved with parsed `path` and `name`.
 *
 * Any `**State:**` value resolves — release wrappers operate on the
 * full WU lifecycle, not just `In Progress`.
 */
export async function resolveActiveWu(
  opts: ResolveActiveWuOptions,
): Promise<WuResolution> {
  const rootSegments = opts.rootSegments ?? DEFAULT_ROOT_SEGMENTS;
  const reader = await readActiveMetaCandidates(opts.cwd, {
    rootSegments,
  });

  if (reader.candidates.length === 0) {
    return { status: "none" };
  }
  if (reader.candidates.length > 1) {
    return { status: "ambiguous", hint: MULTI_CANDIDATE_HINT };
  }

  const candidate = reader.candidates[0];
  if (!candidate) return { status: "none" };
  const name = parseNameFromPath(candidate.path);
  return { status: "resolved", path: candidate.path, name };
}

/**
 * Resolve the current work unit's active meta path, when a single active WU is
 * available. Callers use this as a remote-only self-exclusion key.
 */
export async function resolveOriginatingMetaPath(cwd: string): Promise<string | undefined> {
  const activeWu = await resolveActiveWu({ cwd });
  return activeWu.status === "resolved" ? activeWu.path : undefined;
}

/**
 * Parse the WU name from the resolved meta-file path. Reads the basename
 * and matches the `meta-{name}.md` shape; anything else — e.g. the
 * lite-layout `status.md` — yields the empty string.
 */
function parseNameFromPath(candidatePath: string): string {
  const filename = candidatePath.split("/").pop() ?? "";
  const match = /^meta-(.+)\.md$/.exec(filename);
  return match?.[1] ?? "";
}
