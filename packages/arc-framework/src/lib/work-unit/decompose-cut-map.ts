/**
 * The decompose cut-map contract — the structured request `runDecompose`
 * consumes, parsed from a cut-map file at the `arc decompose` boundary.
 *
 * `decompose` is the first **batch / fan-out** verb: it turns one work unit into
 * a cohort of member destinations, so its input is richer than the single-WU
 * flag surface the sibling verbs take (`runStub` builds `StubParams` from flags
 * for *one* WU). That richer input reaches the command as a structured cut-map
 * file, parsed and validated into a {@link DecomposeParams} before any mutation
 * runs. The cut-map and the workflow's allocation map are two views of one
 * source.
 *
 * This module holds the *shape*; the boundary parser/validator that narrows an
 * untrusted file into a `DecomposeParams` is co-located in the same module. The
 * shape is authored hand-rolled but **CSA-migratable**: a single co-located
 * surface under `lib/work-unit/`, with a versionable top-level envelope
 * ({@link DECOMPOSE_SCHEMA_VERSION}), so a later zod swap reshapes nothing.
 *
 * @module
 */

import type { WorkClass, WorkUnitState } from "../../commands/active/types.js";

/**
 * The cut-map schema version. Bumped when the {@link DecomposeParams} shape
 * changes incompatibly; the validator enforces the envelope so an unrecognized
 * version is rejected rather than silently misread.
 */
export const DECOMPOSE_SCHEMA_VERSION = 1;

/**
 * The transform shape — the origin-disposition axis of the decompose matrix.
 * Governs whether the origin is retired or kept, how its design is distributed,
 * and whether a branch existed to tear down.
 *
 * - `symmetric` — live origin retired; whole draft distributed to N new members.
 * - `extraction` — origin **survives**; only the extracted subset is distributed.
 * - `backlog-stub-source` — a `planned/` stub retired in place; no branch.
 * - `heterogeneous-home` — members route to mixed destinations (new stub, fold,
 *   or atomic edit to a standing doc).
 */
export type TransformShape = "symmetric" | "extraction" | "backlog-stub-source" | "heterogeneous-home";

/**
 * The parent position — the cohort-minting axis of the decompose matrix.
 *
 * - `standalone` — mint a new top-level cohort.
 * - `in-cohort` — mint a sub-cohort under the origin's existing cohort.
 * - `at-cap` — lateral fan-out at the nesting cap; no cohort node, provenance note.
 */
export type ParentPosition = "standalone" | "in-cohort" | "at-cap";

/**
 * The logical location axis of the origin's `(phase, location)` position — the
 * storage tier as a logical value, never a directory or branch inference
 * (the arc-backend design guard). `completed` is excluded: a shipped WU is not a
 * decompose origin.
 */
export type OriginLocation = "provisional" | "planned" | "active";

/**
 * The origin work unit's resolved `(phase, location)` position. Decompose reads
 * the origin's logical state — `phase` is the meta `State` field, `location` the
 * storage tier as a logical value — never `git branch` / `git log` inference.
 * Only `Planning` and `Active` phases are valid decompose origins; the validator
 * rejects the rest.
 */
export interface OriginPosition {
  /** The origin work unit's slug. */
  slug: string;
  /** Logical phase — the origin meta's `State` field. */
  phase: WorkUnitState;
  /** Logical storage tier as a value, not a path. */
  location: OriginLocation;
}

/**
 * A surviving origin's disposition after an extraction. Both are terminal and
 * safe: `keep-active` leaves the thinned origin in `active/`; `park` relocates it
 * to backlog as a **separate** `arc park` workflow step, never a `runDecompose`
 * leg (the park is purely additive over the already-terminal keep-active).
 */
export type OriginDisposition = "keep-active" | "park";

/**
 * How an existing/atomic destination absorbs its allocated share — the
 * heterogeneous shape's workflow-authored direct edits (the executor has no
 * content-editing leg).
 *
 * - `fold` — merge the allocated design into an existing sibling stub or
 *   `draft-design` block.
 * - `atomic-edit` — edit a standing doc in place.
 */
export type ExistingHomeKind = "fold" | "atomic-edit";

/**
 * A newly minted member work unit — the standard scaffold destination (the
 * symmetric and backlog-stub-source shapes, and the new-member legs of an
 * extraction or heterogeneous cut).
 */
export interface NewMemberEntry {
  kind: "new-member";
  /** Member slug → `meta-<slug>.md` / `draft-<slug>.md` filenames + cohort placement. */
  slug: string;
  /** The member's own resolved weight — not inherited from the origin. */
  workClass: WorkClass;
  /**
   * Outgoing `Depends On` edges this member genuinely needs — distributed by
   * actual need, never blanket-inherited from the origin. Internal edges among
   * members are carried separately in {@link DecomposeParams.internalEdges}.
   */
  dependsOn: string[];
  /**
   * The origin design slices allocated to this member — the per-destination
   * share the conservation gate maps and conserves. Section identifiers /
   * boundary labels; the encoding unifies with the allocation-map render.
   */
  receives: string[];
}

/**
 * The retained origin re-entered as a cut-map member — the extraction shape's
 * surviving-origin entry kind. No origin-retire edge fires; the origin keeps
 * every slice not extracted to the other members, so it carries no `receives`.
 */
export interface SurvivingOriginEntry {
  kind: "surviving-origin";
  /** The origin's own slug — the surviving (thinned) work unit. */
  slug: string;
  /** Keep the origin Active in place, or park it to backlog (a separate `arc park` step). */
  disposition: OriginDisposition;
}

/**
 * An existing or atomic destination — the heterogeneous shape's entry kind. Not
 * minted by decompose: its share is a workflow-authored direct edit that rides
 * the decompose PR and is recorded in the allocation map.
 */
export interface ExistingHomeEntry {
  kind: "existing-home";
  /** The destination — an existing member slug, a `draft-design` block, or a standing-doc path. */
  target: string;
  /** How the destination absorbs its share. */
  home: ExistingHomeKind;
  /** The origin design slices allocated here — asserted landed by the conservation gate. */
  receives: string[];
}

/**
 * A single destination in the cut. The discriminated `kind` distinguishes the
 * three entry kinds: a freshly minted member, the surviving origin (extraction),
 * or an existing/atomic home (heterogeneous).
 */
export type CutEntry = NewMemberEntry | SurvivingOriginEntry | ExistingHomeEntry;

/**
 * One internal dependency edge among the new members — authored from the cut's
 * delivery order (`from` depends on `to`). External `Depends On` edges live on
 * each member's {@link NewMemberEntry.dependsOn}; incoming edges from outside the
 * cohort are re-pointed by the sweep, not declared here.
 */
export interface InternalEdge {
  /** The dependent member slug. */
  from: string;
  /** The depended-on member slug. */
  to: string;
}

/**
 * The validated decompose request — the cut-map's parsed form, the substrate
 * `runDecompose` executes over. Carries the versioned envelope, the origin's
 * resolved position and selected matrix cell, the cohort placement, the
 * destination entries, and the internal edge set.
 *
 * Produced by the cut-map validator at the `arc decompose` boundary; the
 * executor never fabricates these judgment values.
 */
export interface DecomposeParams {
  /** The cut-map envelope version — see {@link DECOMPOSE_SCHEMA_VERSION}. */
  schemaVersion: typeof DECOMPOSE_SCHEMA_VERSION;
  /** The origin work unit and its resolved `(phase, location)`. */
  origin: OriginPosition;
  /** The selected transform shape — the origin-disposition matrix axis. */
  shape: TransformShape;
  /** The selected parent position — the cohort-minting matrix axis. */
  parentPosition: ParentPosition;
  /**
   * The cohort path the members enrol under — dual-placed (meta `Cohort` + member
   * draft header). Absent on the `at-cap` lateral fan-out (no cohort node).
   */
  cohort?: string;
  /** The cut's destinations — new members, the surviving origin, and existing/atomic homes. */
  entries: CutEntry[];
  /** Internal dependency edges among the new members. */
  internalEdges: InternalEdge[];
}
