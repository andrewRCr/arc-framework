/**
 * Active-work-unit resolver consumed by the release commit and push
 * handlers.
 *
 * Composes {@link readActiveMetaCandidates} from the active-meta
 * reader. Accepts any `**State:**` value — Planning, In Progress,
 * Paused, etc. — and refuses only on no-candidate or multi-candidate
 * ambiguity. Both refusal shapes map to refusal code 10
 * (`no-active-wu`); the multi-candidate path carries a disambiguation
 * hint that surfaces in the refusal message.
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
  | { status: "refused"; hint?: string };

/**
 * Resolve the unambiguous active WU under the configured active root.
 *
 * - 0 candidates → refused (no hint; the wrapper formats a default
 *   "no active work unit" message at refusal-code 10).
 * - 2+ candidates → refused with disambiguation hint.
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
    return { status: "refused" };
  }
  if (reader.candidates.length > 1) {
    return { status: "refused", hint: MULTI_CANDIDATE_HINT };
  }

  const candidate = reader.candidates[0];
  if (!candidate) return { status: "refused" };
  const name = parseNameFromPath(candidate.path);
  return { status: "resolved", path: candidate.path, name };
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
