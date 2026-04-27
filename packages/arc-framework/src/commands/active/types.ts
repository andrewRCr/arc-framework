/**
 * Type contracts for `arc active status`.
 *
 * The discriminated union on `mode` separates the full enumeration view
 * (per-WU state for general consumers) from the session-init-scoped
 * resolution shape (path / null / candidate list) consumed by the agent
 * harness to populate session-init.md Step 2 Item 8.
 */

/**
 * Directory layout discovered on disk.
 *
 * - `full` — per-category subdirectories with `status-*.md` files.
 * - `lite` — single fixed-path `.arc/active/status.md`.
 *
 * Determined by file presence: `.arc/active/status.md` wins when both
 * shapes are present, since Lite mode's contract is one file.
 */
export type ActiveLayout = "full" | "lite";

/** Resolution state of the session-init-scoped probe. */
export type ActiveSessionInitResolution = "none" | "single" | "multiple";

/**
 * Resolved session type — drives session-init's per-type loadset (Step 3
 * items 9–10). Inferred from active state; null when resolution is
 * `multiple` and the agent must recompute after disambiguation.
 *
 * - `planning` — between work units, or no task list yet.
 * - `execution` — task list present, regular task work.
 * - `integration` — `**Next Action:**` matches an integration-lifecycle
 *   workflow (`integrate-work-unit` / `archive-work-unit`).
 */
export type SessionType = "planning" | "execution" | "integration";

/**
 * One parsed status file. `path` is always relative to the probe's cwd so
 * consumers can cross-reference against other probe results without
 * normalization.
 */
export interface StatusFileCandidate {
  /** Path relative to cwd — e.g. `.arc/active/technical/status-foo.md`. */
  path: string;
  /** Basename — e.g. `status-foo.md`. Used by session-init's SESSION-NOTES-first precedence. */
  filename: string;
  branch: string | null;
  /** Raw `**State:**` value verbatim — e.g. `In Progress`, `Paused (2026-04-12)`, `Waiting For Review`. */
  state: string | null;
  /** Raw `**Next Task:**` value — triple-anchor format `Task X.Y — title (line ~N)`. */
  nextTask: string | null;
  /** Raw `**Task List:**` value — path or `[none]`. */
  taskList: string | null;
  /** Raw `**Next Action:**` value — freeform action description; carries lifecycle workflow step pointers. */
  nextAction: string | null;
}

/** Full enumeration — default rendering. */
export interface ActiveStatusResult {
  mode: "full";
  layout: ActiveLayout;
  candidates: StatusFileCandidate[];
  /** Diagnostics from missing directories or unreadable files. */
  warnings: string[];
}

/**
 * Session-init-scoped result — maps to session-init.md Step 2 Item 8.
 *
 * - `resolution === "none"`: no active work unit (`path` is `null`).
 * - `resolution === "single"`: one candidate resolved (`path` populated).
 * - `resolution === "multiple"`: agent applies SESSION-NOTES / branch / state
 *   precedence over `candidates` before prompting.
 */
export interface ActiveSessionInitResult {
  mode: "session-init";
  layout: ActiveLayout;
  resolution: ActiveSessionInitResolution;
  /** Resolved candidate path when `resolution === "single"`; otherwise `null`. */
  path: string | null;
  /** Candidate list when `resolution === "multiple"`; empty otherwise. */
  candidates: StatusFileCandidate[];
  /**
   * Resolved companion-file paths for the active task list, derived only when
   * `resolution === "single"` and the parsed `**Task List:**` filename matches
   * the Full-layout `tasks-{stem}.md` pattern. Field is omitted (not `null`)
   * when those preconditions don't hold (e.g., no active WU, multi-WU
   * disambiguation, or Lite-shape `tasks.md`); inner values are `null` when
   * the file is absent. Paths are relative to cwd (forward-slash normalized
   * to match `path`).
   */
  companions?: {
    notes: string | null;
    atomic: string | null;
  };
  /**
   * Resolved session type for per-type loadset selection. Computed from
   * `resolution` plus the resolved candidate's `**Task List:**` and
   * `**Next Action:**` fields. `null` when `resolution === "multiple"`
   * and the caller must disambiguate before computing type.
   */
  sessionType: SessionType | null;
  warnings: string[];
}

export type ActiveResult = ActiveStatusResult | ActiveSessionInitResult;

export interface ActiveStatusOptions {
  cwd: string;
}

/**
 * Session-init probe options.
 *
 * `identity` and `role` drive role-aware active resolution: contributor flow
 * scans `.arc/user/{identity}/active/` (flat scan-shape — no category subdirs);
 * maintainer flow (or absent role) scans `.arc/active/` with category subdirs.
 *
 * When `role === "contributor"` and `identity === null`, the probe short-
 * circuits to `resolution: "none"` with a diagnostic warning — the contributor
 * active root is identity-keyed and cannot be resolved without one.
 */
export interface ActiveSessionInitOptions {
  cwd: string;
  identity?: string | null;
  role?: string | null;
}
