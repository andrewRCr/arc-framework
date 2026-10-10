/** Compose the routing wait advisory from a target's scheduling horizon. */

import type { LifecycleState } from "../work-unit/lifecycle-resolver.js";
import type { ProjectReadinessRecord } from "./project-view.js";

/**
 * Explain the wait implied by routing to a distant or paused target.
 * @param record - Selected target's identity, priority, and scheduling fact.
 * @param state - Canonical lifecycle state from the same composed record set.
 * @returns One advisory line, or null when no distant horizon applies.
 */
export function projectHorizonAdvisory(
  record: Pick<ProjectReadinessRecord, "slug" | "priority" | "scheduling">,
  state: LifecycleState,
): string | null {
  if (state === "parked" || record.scheduling === "parked") {
    return `\`${record.slug}\` is parked (${record.priority}); an entry routed here waits for its resumption. `
      + "Resume it or send a separable part now?";
  }
  const horizon = state === "provisional" ? `provisional (${record.priority})`
    : state === "planned" && record.priority === "P3" ? "planned at P3" : null;
  if (horizon === null) return null;
  return `\`${record.slug}\` is ${horizon}; an entry routed here waits for it. `
    + "Raise its priority or send a separable part now?";
}
