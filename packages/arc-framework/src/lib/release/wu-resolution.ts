/**
 * Active-work-unit resolver consumed by the release commit and push
 * handlers (PRD R6).
 *
 * Composes {@link readActiveStatusCandidates} from the active-status
 * reader. Accepts any `**State:**` value — Planning, In Progress,
 * Paused, etc. — and refuses only on no-candidate or multi-candidate
 * ambiguity. Both refusal shapes map to refusal code 10
 * (`no-active-wu`); the multi-candidate path carries a disambiguation
 * hint that surfaces in the refusal message.
 *
 * @module
 */

import { readActiveStatusCandidates } from "../active/status-reader.js";
import type { ActiveScanShape } from "../active/status-reader.js";
import type { ActiveLayout } from "../../commands/active/types.js";

const DEFAULT_ROOT_SEGMENTS = [".arc", "active"] as const;

const MULTI_CANDIDATE_HINT =
  "Multiple status files resolved under the active root. Run session-init disambiguation to choose.";

export interface ResolveActiveWuOptions {
  cwd: string;
  /**
   * Active-root segments. Defaults to maintainer scope (`[".arc", "active"]`);
   * contributor scope is `[".arc", "user", identity, "active"]`.
   */
  rootSegments?: readonly string[];
  /** Scan shape under the active root. Defaults to `subdir` (maintainer). */
  scanShape?: ActiveScanShape;
}

/**
 * Successful resolution: the unambiguous active WU.
 *
 * `path` is relative to `cwd` and matches the active-status reader's
 * shape. `category` and `name` are parsed from the path against the
 * active root; both are empty strings for the lite layout (`status.md`
 * directly under the active root) where neither concept applies.
 */
export interface ResolvedWu {
  path: string;
  category: string;
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
 * - 1 candidate → resolved with parsed `path`, `category`, `name`.
 *
 * Any `**State:**` value resolves — release wrappers operate on the
 * full WU lifecycle, not just `In Progress`.
 */
export async function resolveActiveWu(
  opts: ResolveActiveWuOptions,
): Promise<WuResolution> {
  const rootSegments = opts.rootSegments ?? DEFAULT_ROOT_SEGMENTS;
  const reader = await readActiveStatusCandidates(opts.cwd, {
    rootSegments,
    scanShape: opts.scanShape,
  });

  if (reader.candidates.length === 0) {
    return { status: "refused" };
  }
  if (reader.candidates.length > 1) {
    return { status: "refused", hint: MULTI_CANDIDATE_HINT };
  }

  const candidate = reader.candidates[0];
  if (!candidate) return { status: "refused" };
  const { category, name } = parseCategoryAndName(
    candidate.path,
    rootSegments,
    reader.layout,
  );
  return { status: "resolved", path: candidate.path, category, name };
}

function parseCategoryAndName(
  candidatePath: string,
  rootSegments: readonly string[],
  layout: ActiveLayout,
): { category: string; name: string } {
  if (layout === "lite") {
    return { category: "", name: "" };
  }

  const rootPrefix = `${rootSegments.join("/")}/`;
  const trailing = candidatePath.startsWith(rootPrefix)
    ? candidatePath.slice(rootPrefix.length)
    : candidatePath;
  const parts = trailing.split("/");

  if (parts.length === 1) {
    const filename = parts[0] ?? "";
    return { category: "", name: parseNameFromFilename(filename) };
  }
  const category = parts[0] ?? "";
  const filename = parts[parts.length - 1] ?? "";
  return { category, name: parseNameFromFilename(filename) };
}

function parseNameFromFilename(filename: string): string {
  const match = /^status-(.+)\.md$/.exec(filename);
  return match?.[1] ?? "";
}
