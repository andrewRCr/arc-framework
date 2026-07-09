/**
 * Assemble the ready-mine render slice — the identity's startable planned work.
 *
 * The ready slice is the second source behind the user view (alongside the
 * git-derived in-flight slice): the work that is *ready to start now*. A planned
 * work unit qualifies when it is **owned by the identity** and **unblocked** —
 * every listed dependency resolves shipped through the lifecycle index, per the
 * readiness model the project readiness view renders from. Missing targets do
 * not satisfy an edge.
 *
 * Two resolutions happen here, the boundary between the raw planned facts and the
 * view contract:
 *
 * - **Class** narrows to the display form (`Light` / `Heavy` / `Novel` /
 *   `[TBD]`), set only when the meta carried the field — so the row sizes the
 *   work for the balance decision the view supports.
 * - **Priority** narrows to the codified level, set only when the meta carried an
 *   explicit value so the render core's conditional column drops for an
 *   all-default slice.
 *
 * Unlike the in-flight slice, this source is purely local (planned metas on disk)
 * and so is always available — it never degrades when the remote is unreachable.
 *
 * @module
 */

import { validateClass, validatePriority } from "../../commands/active/types.js";
import type { LifecycleIndex } from "../work-unit/lifecycle-index.js";
import { resolveSlugQuery } from "../work-unit/lifecycle-query.js";

import type { StatusViewRow } from "./render.js";

/** A planned work unit's render-relevant fields, parsed from its `backlog/planned/` meta. */
export interface PlannedWorkUnit {
  /** Canonical WU-name — the directory / `meta-<name>.md` stem. */
  name: string;
  /** `**Owner:**` from the meta; absent when unattributed. */
  owner?: string;
  /** Parsed `**Depends On:**` WU-names; empty when independent (`[none]`). */
  dependsOn: readonly string[];
  /** `**Cohort:**` from the meta; absent when unset or `[none]`. */
  cohort?: string;
  /** Raw `**Class:**` weight from the meta; absent only when the field is unset. */
  class?: string;
  /** Raw `**Priority:**` level from the meta; absent when unset or `[none]`. */
  priority?: string;
}

/** Whether a planned WU belongs to the identity's slice (its own or unattributed). */
function isMine(owner: string | undefined, identity: string | null): boolean {
  return identity === null || owner === undefined || owner === identity;
}

/**
 * Build the ready-mine slice from parsed planned work units.
 *
 * Filters to the identity's unblocked planned work: owned (or unattributed) and
 * carrying only dependencies that resolve shipped through the lifecycle index.
 * Ready rows carry no dependency cell (every dep is satisfied) and a constant
 * `Planning` state.
 *
 * @param planned - Parsed planned work units (one per `backlog/planned/` meta).
 * @param lifecycleIndex - Lifecycle-complete slug index for dependency classification.
 * @param identity - Owner to filter to; `null` keeps every planned WU.
 * @returns Render rows for the identity's ready planned work units.
 */
export function buildReadyMineSlice(
  planned: readonly PlannedWorkUnit[],
  lifecycleIndex: LifecycleIndex,
  identity: string | null,
): StatusViewRow[] {
  return planned
    .filter((wu) => isMine(wu.owner, identity))
    .filter((wu) => wu.dependsOn.every((dep) => resolveSlugQuery(lifecycleIndex, dep).shipped))
    .map((wu) => ({
      workUnit: wu.name,
      state: "Planning" as const,
      ...(wu.class !== undefined ? { class: validateClass(wu.class) } : {}),
      ...(wu.priority !== undefined ? { priority: validatePriority(wu.priority) } : {}),
      ...(wu.cohort !== undefined ? { cohort: wu.cohort } : {}),
      dependsOn: [],
    }));
}
