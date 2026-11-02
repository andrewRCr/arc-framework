/**
 * Type contracts for `arc active status`.
 *
 * The discriminated union on `mode` separates the full enumeration view
 * (per-WU state for general consumers) from the session-init-scoped
 * resolution shape (path / null / candidate list) used by composed entry reads.
 */

import type { z } from "zod";
import type { ActiveSessionInitResultSchema } from "./schema.js";

import type { GitExec } from "../../lib/git/index.js";
import type { Slug } from "../../lib/kernel/index.js";
import type { WorkUnitPlacement } from "../../lib/layout/index.js";
import type { IntegrationBoundaryLocus } from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import type { CandidateTargetProjector } from "../../lib/work-unit/candidate-effective-target.js";
import type { CandidateReviewFixAuthorityReader } from
  "../../scripts/review-gate/policy/candidate-review-fix-continuation.js";

/** Named work-unit metadata uses the flat `meta-*.md` active layout. */
export type ActiveLayout = "full";

/** Resolution state of the session-init-scoped probe. */
export type ActiveSessionInitResolution = "none" | "single" | "multiple";

/** Resolved session phase carried by active-context projections. */
export type SessionType = "planning" | "execution" | "prepublication" | "integration";

/**
 * One parsed meta file. `path` is always relative to the probe's cwd so
 * consumers can cross-reference against other probe results without
 * normalization.
 */
export interface MetaFileCandidate {
  /** Path relative to cwd — e.g. `.arc/active/meta-foo.md`. */
  path: string;
  /** Basename — e.g. `meta-foo.md` — identifying the candidate independently of its directory. */
  filename: string;
  branch: string | null;
  candidateId?: string | null;
  integrationBoundary?: IntegrationBoundaryLocus | null;
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
 * Active-namespace resolution evidence for session entry.
 *
 * - `none`: no resolved candidate path.
 * - `single`: one candidate resolved and its path populated.
 * - `multiple`: an unresolved candidate inventory.
 *
 * The composition layer owns the bound checkout and subject used for context.
 */
export type ActiveSessionInitResult = z.infer<typeof ActiveSessionInitResultSchema>;

/** Internal semantic companion retained for conventional artifact projection. */
export interface ActiveCandidateSemantics {
  candidate: MetaFileCandidate;
  slug: Slug;
  placement: WorkUnitPlacement;
}

/** Internal active resolution; the serialized session-init envelope remains {@link ActiveSessionInitResult}. */
export interface ActiveSessionInitInternalResult {
  result: ActiveSessionInitResult;
  resolved: ActiveCandidateSemantics | null;
  candidates: ActiveCandidateSemantics[];
}

export type ActiveResult = ActiveStatusResult | ActiveSessionInitResult;

export interface ActiveStatusOptions {
  cwd: string;
  exec?: GitExec;
  projectCandidateTarget?: CandidateTargetProjector;
  /** Override for resolving durable pending Candidate fix authority. */
  readPendingCandidateReviewFixAuthority?: CandidateReviewFixAuthorityReader;
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
  projectCandidateTarget?: CandidateTargetProjector;
  /** Override for resolving durable pending Candidate fix authority. */
  readPendingCandidateReviewFixAuthority?: CandidateReviewFixAuthorityReader;
}
