/**
 * `arc active status` probe implementations.
 *
 * Two entry points:
 *
 * - {@link runActiveStatus} — full per-WU enumeration for default rendering.
 * - {@link runActiveSessionInitStatus} — resolved path / null / candidate
 *   list for the session-init harness (Step 2 Item 8 consumer).
 *
 * Both share the filesystem work through {@link readActiveStatusCandidates};
 * the session-init variant applies a thin resolution-state shaping on top.
 *
 * @module
 */

import { readActiveStatusCandidates } from "../../lib/active/status-reader.js";
import type {
  ActiveSessionInitOptions,
  ActiveSessionInitResolution,
  ActiveSessionInitResult,
  ActiveStatusOptions,
  ActiveStatusResult,
  StatusFileCandidate,
} from "./types.js";

/** Produce the full per-WU enumeration for `arc active status` (default mode). */
export async function runActiveStatus(
  options: ActiveStatusOptions,
): Promise<ActiveStatusResult> {
  const { layout, candidates, warnings } = await readActiveStatusCandidates(options.cwd);
  return {
    mode: "full",
    layout,
    candidates,
    warnings,
  };
}

/**
 * Produce the session-init-scoped result for
 * `arc active status --session-init`.
 *
 * Resolution states map to session-init.md Step 2 Item 8:
 *
 * - `none` — zero-file case; session-init reports no active work.
 * - `single` — one-file case; the harness loads the resolved path.
 * - `multiple` — many-file case; the harness applies the documented
 *   precedence (SESSION-NOTES `**Working On:**`, branch match,
 *   `**State:** In Progress`, user prompt) over the returned candidates.
 *
 * The probe does not apply the precedence itself — SESSION-NOTES lives
 * in the user workspace and requires identity-scoped path resolution
 * the agent already does.
 */
export async function runActiveSessionInitStatus(
  options: ActiveSessionInitOptions,
): Promise<ActiveSessionInitResult> {
  const { layout, candidates, warnings } = await readActiveStatusCandidates(options.cwd);
  return resolveSessionInit(layout, candidates, warnings);
}

function resolveSessionInit(
  layout: ActiveSessionInitResult["layout"],
  candidates: StatusFileCandidate[],
  warnings: string[],
): ActiveSessionInitResult {
  let resolution: ActiveSessionInitResolution;
  let path: string | null;
  let emittedCandidates: StatusFileCandidate[];

  const [only] = candidates;
  if (only === undefined) {
    resolution = "none";
    path = null;
    emittedCandidates = [];
  } else if (candidates.length === 1) {
    resolution = "single";
    path = only.path;
    emittedCandidates = [];
  } else {
    resolution = "multiple";
    path = null;
    emittedCandidates = candidates;
  }

  return {
    mode: "session-init",
    layout,
    resolution,
    path,
    candidates: emittedCandidates,
    warnings,
  };
}
