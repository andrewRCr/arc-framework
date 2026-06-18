/**
 * Type contracts for `arc active status`.
 *
 * The discriminated union on `mode` separates the full enumeration view
 * (per-WU state for general consumers) from the session-init-scoped
 * resolution shape (path / null / candidate list) consumed by the agent
 * harness to populate session-init.md Step 2 Item 8.
 */

import type { GitExec } from "../../lib/git/index.js";
import type { PlanningWorkflow } from "../../lib/active/current-workflow-consistency.js";

/**
 * Directory layout discovered on disk.
 *
 * - `full` — `meta-*.md` files rooted directly at the active dir. The
 *   reader enumerates the active root non-recursively, so this is a flat
 *   layout: meta files placed in subdirectories are not discovered.
 * - `lite` — single fixed-path `.arc/active/status.md`.
 *
 * Determined by file presence: `.arc/active/status.md` wins when both
 * shapes are present, since Lite mode's contract is one file.
 */
export type ActiveLayout = "full" | "lite";

/** Resolution state of the session-init-scoped probe. */
export type ActiveSessionInitResolution = "none" | "single" | "multiple";

/**
 * Codified work-unit lifecycle states — one value per phase of the state
 * machine: Planning → Active → Integrating → Shipped. Branch creation and
 * commitment level (provisional vs planned) live elsewhere (branch
 * existence and `backlog/` subdirectory), not in State.
 */
export type WorkUnitState = "Planning" | "Active" | "Integrating" | "Shipped";

/**
 * Narrow a raw `**State:**` field value to the codified `WorkUnitState`
 * enum. Anything unrecognized — including `null`, the empty string, and
 * whitespace-only — returns `"unknown"`.
 *
 * Parsers (`parseMetaFile`, meta-field readers) return the raw `State`
 * string verbatim; callers that need enum narrowing import and apply
 * `validateState` explicitly.
 *
 * @param s - Raw `**State:**` field value, or `null` when absent.
 * @returns The narrowed `WorkUnitState`, or `"unknown"` when the input
 *   does not match a codified value.
 */
export function validateState(s: string | null): WorkUnitState | "unknown" {
  if (s === null) return "unknown";
  switch (s) {
    case "Planning":
    case "Active":
    case "Integrating":
    case "Shipped":
      return s;
    default:
      return "unknown";
  }
}

/**
 * Codified per-WU attention levels for triaging a multi-in-flight worklist:
 * `P1` (top focus) → `P2` (elevated) → `P3` (baseline). `P3` is the default —
 * there is no `P0` (its stop-the-world connotation misfits a standing scale).
 */
export type Priority = "P1" | "P2" | "P3";

/**
 * Narrow a raw `**Priority:**` field value to the codified `Priority` enum.
 * Unlike {@link validateState}, this never reports failure: anything
 * unrecognized — `null`, the empty string, `[none]`, an out-of-range level
 * (`P0`, `P5`), or any malformed input — resolves to the `P3` baseline, so
 * callers always get a usable level for sort and render.
 *
 * Parsers return the raw `Priority` string verbatim; callers that need enum
 * narrowing import and apply `validatePriority` explicitly.
 *
 * @param p - Raw `**Priority:**` field value, or `null` when absent.
 * @returns The narrowed `Priority`, defaulting to `"P3"`.
 */
export function validatePriority(p: string | null): Priority {
  switch (p) {
    case "P1":
    case "P2":
    case "P3":
      return p;
    default:
      return "P3";
  }
}

/**
 * Codified work-unit weight — the recorded `Class`. `Light` / `Heavy` /
 * `Novel` are the resolved values; a WU carries the `[TBD]` sentinel until it
 * is classified. Indicates intrinsic demand across planning, execution, and
 * review — distinct from the quality-gate tier.
 */
export type WorkClass = "Light" | "Heavy" | "Novel";

/**
 * Narrow a raw `**Class:**` field value to the codified `WorkClass`, or the
 * `[TBD]` pre-classification sentinel. Matching is case-insensitive — the field
 * has historical lowercase values across metas — so `light` / `Light` resolve
 * to `Light`, `heavy` / `Heavy` to `Heavy`, and `novel` / `Novel` to `Novel`.
 * Everything else — `null`, the empty string, `[TBD]`, or any unrecognized token
 * — resolves to `[TBD]`, so an unclassified or absent value renders as the
 * sentinel rather than throwing.
 *
 * Parsers return the raw `Class` string verbatim; callers that need the display
 * form import and apply `validateClass` explicitly.
 *
 * @param c - Raw `**Class:**` field value, or `null` when absent.
 * @returns The narrowed `WorkClass`, or `"[TBD]"` when unclassified or absent.
 */
export function validateClass(c: string | null): WorkClass | "[TBD]" {
  switch (c?.trim().toLowerCase()) {
    case "light":
      return "Light";
    case "heavy":
      return "Heavy";
    case "novel":
      return "Novel";
    default:
      return "[TBD]";
  }
}

/**
 * Resolved session type — drives session-init's per-type loadset (Step 3
 * items 9–10). Inferred from active state.
 *
 * - `planning` — between work units, or no task list yet.
 * - `execution` — task list present, regular task work.
 * - `integration` — `**Next Action:**` matches an integration-lifecycle
 *   workflow (`integrate-work-unit` / `archive-work-unit`).
 *
 * `null` is reserved for two cases at the envelope:
 *
 * - `resolution: "multiple"` — agent must disambiguate before computing type.
 * - Orphan: no candidate (or candidate has empty State) and the current
 *   branch does not match the planning-branch pattern.
 */
export type SessionType = "planning" | "execution" | "integration";

/**
 * One parsed meta file. `path` is always relative to the probe's cwd so
 * consumers can cross-reference against other probe results without
 * normalization.
 */
export interface MetaFileCandidate {
  /** Path relative to cwd — e.g. `.arc/active/meta-foo.md`. */
  path: string;
  /** Basename — e.g. `meta-foo.md`. Used by session-init's SESSION-NOTES-first precedence. */
  filename: string;
  branch: string | null;
  /** Raw `**State:**` value verbatim — e.g. `Active`, `Integrating`, `Paused (2026-04-12)`. */
  state: string | null;
  /** Raw `**Next Task:**` value — triple-anchor format `Task X.Y — title (line ~N)`. */
  nextTask: string | null;
  /** Raw `**Task List:**` value — path or `[none]`. */
  taskList: string | null;
  /** Raw `**Next Action:**` value — freeform action description; carries lifecycle workflow step pointers. */
  nextAction: string | null;
  /**
   * Bare `**Current Workflow:**` value — the planning-stage basename
   * (`draft-design` / `create-spec` / `generate-tasks`), `[none]` outside
   * planning, or `null` on a legacy meta predating the field.
   */
  currentWorkflow: string | null;
}

/** Full enumeration — default rendering. */
export interface ActiveStatusResult {
  mode: "full";
  layout: ActiveLayout;
  candidates: MetaFileCandidate[];
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
  candidates: MetaFileCandidate[];
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
  /**
   * Resolved planning sub-stage workflow basename (`draft-design` / `create-spec`
   * / `generate-tasks`) — what session-init's planning arm loads as `<stage>.md`,
   * replacing the old `Next Action` prose-parse. Read from the meta's
   * `Current Workflow` field; a meta missing it (a fresh in-place scaffold, or a
   * legacy meta) resolves to the `draft-design` entry stage. Populated only when
   * `sessionType === "planning"` and `resolution === "single"`; `null` everywhere
   * else (non-planning sessions, multi-WU disambiguation, orphan no-meta branch).
   */
  planningStage: PlanningWorkflow | null;
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
 * scans `.arc/user/{identity}/active/` (flat scan-shape — no category subdirs).
 * A per-WU subdir layout (`.arc/user/{identity}/<wu-name>/` with
 * contributor-meta inside) is the eventual replacement for the flat
 * `active/` subdir; the scan-shape reshape composes with broader
 * contributor-lifecycle support that isn't wired through this resolver yet.
 * Maintainer flow (or absent role) scans `.arc/active/` directly (flat —
 * the reader is non-recursive; see `ActiveLayout`).
 *
 * When `role === "contributor"` and `identity === null`, the probe short-
 * circuits to `resolution: "none"` with a diagnostic warning — the contributor
 * active root is identity-keyed and cannot be resolved without one.
 */
export interface ActiveSessionInitOptions {
  cwd: string;
  identity?: string | null;
  role?: string | null;
  /**
   * Required for `git rev-parse --abbrev-ref HEAD` lookup at the
   * branch-pattern fallback tier of session-type inference (orphan case).
   */
  exec: GitExec;
}
