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

import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import type { WorkClass, WorkUnitState } from "../../commands/active/types.js";
import { isSlugSafe } from "./slug.js";

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

/**
 * The outcome of parsing an untrusted cut-map — a named rejection reason, or the
 * validated {@link DecomposeParams}. Mirrors the discriminated
 * `{ status: "rejected" } | { status: … }` shape the sibling verbs return
 * (`StubResult` / `ArchiveResult`), so the `arc decompose` boundary rejects a
 * malformed cut-map before any mutation runs.
 */
export type CutMapParseResult =
  | { status: "rejected"; reason: string }
  | { status: "parsed"; params: DecomposeParams };

const TRANSFORM_SHAPES: readonly TransformShape[] = [
  "symmetric",
  "extraction",
  "backlog-stub-source",
  "heterogeneous-home",
];
const PARENT_POSITIONS: readonly ParentPosition[] = ["standalone", "in-cohort", "at-cap"];
const ORIGIN_LOCATIONS: readonly OriginLocation[] = ["provisional", "planned", "active"];
/** Only a `Planning` or `Active` origin is a valid decompose source. */
const ORIGIN_PHASES: readonly WorkUnitState[] = ["Planning", "Active"];
const WORK_CLASSES: readonly WorkClass[] = ["Light", "Heavy", "Novel"];
const ORIGIN_DISPOSITIONS: readonly OriginDisposition[] = ["keep-active", "park"];
const EXISTING_HOME_KINDS: readonly ExistingHomeKind[] = ["fold", "atomic-edit"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isIn<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** Validate one entry by its `kind` discriminant; returns a named reason, or the typed entry. */
function parseEntry(raw: unknown, position: number): { reason: string } | { entry: CutEntry } {
  if (!isObject(raw)) return { reason: `entry ${position} must be an object.` };
  const kind = raw.kind;

  if (kind === "new-member") {
    if (!isNonEmptyString(raw.slug) || !isSlugSafe(raw.slug)) {
      return { reason: `entry ${position} (new-member) requires a slug-safe \`slug\`.` };
    }
    if (!isIn(raw.workClass, WORK_CLASSES)) {
      return { reason: `member "${raw.slug}" requires a resolved \`Class\` (\`Light\` | \`Heavy\` | \`Novel\`).` };
    }
    if (!isStringArray(raw.dependsOn)) {
      return { reason: `member "${raw.slug}" requires a \`dependsOn\` string array (use \`[]\` for none).` };
    }
    if (!isStringArray(raw.receives) || raw.receives.length === 0) {
      return { reason: `member "${raw.slug}" requires a non-empty distribution (\`receives\`).` };
    }
    return {
      entry: { kind, slug: raw.slug, workClass: raw.workClass, dependsOn: raw.dependsOn, receives: raw.receives },
    };
  }

  if (kind === "surviving-origin") {
    if (!isNonEmptyString(raw.slug) || !isSlugSafe(raw.slug)) {
      return { reason: `entry ${position} (surviving-origin) requires a slug-safe \`slug\`.` };
    }
    if (!isIn(raw.disposition, ORIGIN_DISPOSITIONS)) {
      return { reason: `surviving origin "${raw.slug}" requires a \`disposition\` (\`keep-active\` | \`park\`).` };
    }
    return { entry: { kind, slug: raw.slug, disposition: raw.disposition } };
  }

  if (kind === "existing-home") {
    if (!isNonEmptyString(raw.target)) {
      return { reason: `entry ${position} (existing-home) requires a non-empty \`target\`.` };
    }
    if (!isIn(raw.home, EXISTING_HOME_KINDS)) {
      return { reason: `existing-home "${raw.target}" requires a \`home\` (\`fold\` | \`atomic-edit\`).` };
    }
    if (!isStringArray(raw.receives) || raw.receives.length === 0) {
      return { reason: `existing-home "${raw.target}" requires a non-empty distribution (\`receives\`).` };
    }
    return { entry: { kind, target: raw.target, home: raw.home, receives: raw.receives } };
  }

  return { reason: `entry ${position} has an unknown \`kind\` (expected new-member | surviving-origin | existing-home).` };
}

/** Assert the cut clears the per-shape member floor; returns a named reason, or `null`. */
function shapeFloorError(shape: TransformShape, entries: CutEntry[]): string | null {
  const newMembers = entries.filter((e) => e.kind === "new-member").length;
  const survivors = entries.filter((e) => e.kind === "surviving-origin").length;

  switch (shape) {
    case "symmetric":
    case "backlog-stub-source":
      // The origin retires into its replacements, so the cohort is the new members alone.
      return newMembers >= 2 ? null : `the \`${shape}\` shape requires at least 2 new members; got ${newMembers}.`;
    case "extraction":
      // The origin survives; a decomposition needs at least one extracted member beside it.
      return survivors >= 1 && newMembers >= 1
        ? null
        : "the `extraction` shape requires a surviving origin and at least 1 extracted member.";
    case "heterogeneous-home":
      return entries.length >= 2 ? null : `the \`heterogeneous-home\` shape requires at least 2 destinations.`;
  }
}

/**
 * Parse and validate an untrusted cut-map (a deserialized object) into a
 * {@link DecomposeParams}. The single boundary entry point: it enforces the
 * version envelope, the origin's resolved position, the selected matrix cell,
 * the cohort path (reusing the sibling verbs' `cohort-path` guards), every
 * entry's discriminated shape, and the per-shape member floor — returning a
 * named rejection on the first failure so no malformed cut-map reaches a
 * mutation.
 *
 * Format deserialization (reading the file, `JSON.parse`) is the command's job;
 * this validates the resulting structure, shaped so a later zod swap is a
 * drop-in replacement of this function.
 *
 * @param input - The deserialized cut-map object, untrusted.
 * @returns A rejection with a named reason, or the validated `DecomposeParams`.
 */
export function parseCutMap(input: unknown): CutMapParseResult {
  if (!isObject(input)) return { status: "rejected", reason: "cut-map must be an object." };

  if (input.schemaVersion !== DECOMPOSE_SCHEMA_VERSION) {
    return {
      status: "rejected",
      reason: `unrecognized cut-map \`schemaVersion\` (expected ${DECOMPOSE_SCHEMA_VERSION}).`,
    };
  }

  const origin = input.origin;
  if (!isObject(origin)) return { status: "rejected", reason: "cut-map requires an `origin` object." };
  if (!isNonEmptyString(origin.slug) || !isSlugSafe(origin.slug)) {
    return { status: "rejected", reason: "`origin` requires a slug-safe `slug`." };
  }
  if (!isIn(origin.phase, ORIGIN_PHASES)) {
    return { status: "rejected", reason: "`origin.phase` must be `Planning` or `Active` (a valid decompose source)." };
  }
  if (!isIn(origin.location, ORIGIN_LOCATIONS)) {
    return { status: "rejected", reason: "`origin.location` must be `provisional`, `planned`, or `active`." };
  }

  if (!isIn(input.shape, TRANSFORM_SHAPES)) {
    return { status: "rejected", reason: "cut-map requires a known `shape` (the transform-shape axis)." };
  }
  if (!isIn(input.parentPosition, PARENT_POSITIONS)) {
    return { status: "rejected", reason: "cut-map requires a known `parentPosition` (the parent-position axis)." };
  }

  let cohort: string | undefined;
  if (input.cohort !== undefined) {
    if (typeof input.cohort !== "string") {
      return { status: "rejected", reason: "`cohort`, when present, must be a string." };
    }
    if (!isSafeCohortPath(input.cohort)) {
      return { status: "rejected", reason: `\`cohort\` rejects an unsafe path "${input.cohort}".` };
    }
    const shapeError = validateCohortPath(input.cohort);
    if (shapeError !== null) return { status: "rejected", reason: `\`cohort\`: ${shapeError}.` };
    cohort = input.cohort;
  }

  if (!Array.isArray(input.entries)) {
    return { status: "rejected", reason: "cut-map requires an `entries` array." };
  }
  const parsedEntries: CutEntry[] = [];
  for (let i = 0; i < input.entries.length; i++) {
    const result = parseEntry(input.entries[i], i);
    if ("reason" in result) return { status: "rejected", reason: result.reason };
    parsedEntries.push(result.entry);
  }

  const floorError = shapeFloorError(input.shape, parsedEntries);
  if (floorError !== null) return { status: "rejected", reason: floorError };

  if (!Array.isArray(input.internalEdges)) {
    return { status: "rejected", reason: "cut-map requires an `internalEdges` array (use `[]` for none)." };
  }
  const parsedEdges: InternalEdge[] = [];
  for (let i = 0; i < input.internalEdges.length; i++) {
    const edge: unknown = input.internalEdges[i];
    if (!isObject(edge) || !isNonEmptyString(edge.from) || !isNonEmptyString(edge.to)) {
      return { status: "rejected", reason: `internal edge ${i} requires non-empty \`from\` and \`to\` slugs.` };
    }
    parsedEdges.push({ from: edge.from, to: edge.to });
  }

  const params: DecomposeParams = {
    schemaVersion: DECOMPOSE_SCHEMA_VERSION,
    origin: { slug: origin.slug, phase: origin.phase, location: origin.location },
    shape: input.shape,
    parentPosition: input.parentPosition,
    entries: parsedEntries,
    internalEdges: parsedEdges,
  };
  if (cohort !== undefined) params.cohort = cohort;

  return { status: "parsed", params };
}
