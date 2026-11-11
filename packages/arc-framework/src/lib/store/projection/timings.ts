/** Recent projection costs. Persisted samples end before their final publication; external budgets time the complete operation. */
import { performance } from "node:perf_hooks";
import type { ProjectionIndex } from "./index-schema.js";
import type { ProjectionEnginePorts } from "./engine-ports.js";
import type { ProjectionRootState } from "./process-state.js";
import { projectionProcessState } from "./process-state.js";

/** The three operations whose recent median has an explicit projection cost bound. */
export type ProjectionTimingKey = "start" | "fan-out" | "materialization";
/** A complete recent window whose measured median exceeds its platform's bound. */
export interface ProjectionTripwire { readonly key: ProjectionTimingKey; readonly medianMs: number; readonly boundMs: number }

const keys: readonly ProjectionTimingKey[] = ["start", "fan-out", "materialization"];
const labels: Record<ProjectionTimingKey, string> = { start: "command start", "fan-out": "fan-out", materialization: "full materialization" };

/** Read a monotonic clock, overridable at the time boundary. */
export function projectionTimingNow(ports: Pick<ProjectionEnginePorts, "now">): number { return ports.now === undefined ? performance.now() : ports.now(); }

/** Retain only the newest nine samples without writing an index or changing another operation's history. */
export function recordProjectionTiming(index: ProjectionIndex, key: ProjectionTimingKey, elapsed: number): ProjectionIndex {
  return { ...index, tripwires: { ...index.tripwires, [key]: [...(index.tripwires[key] ?? []).slice(-8), Math.max(0, elapsed)] } };
}

/** Wait for a complete nine-sample median so an isolated stall cannot trigger a notice. */
export function projectionTripwires(tripwires: ProjectionIndex["tripwires"], platform: NodeJS.Platform = process.platform): readonly ProjectionTripwire[] {
  const bounds = platform === "win32" ? { start: 120, "fan-out": 600, materialization: 5_000 }
    : { start: 20, "fan-out": 100, materialization: 1_000 };
  return keys.flatMap(key => {
    const values = tripwires[key];
    if (!Array.isArray(values) || values.length !== 9 || !values.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) return [];
    const medianMs = [...values].sort((a, b) => a - b)[4];
    return medianMs !== undefined && medianMs > bounds[key] ? [{ key, medianMs, boundMs: bounds[key] }] : [];
  });
}

/** Use the same measured median and bound in command notices and status. */
export function formatProjectionTripwire(tripwire: ProjectionTripwire): string {
  return `${labels[tripwire.key]} median ${tripwire.medianMs.toFixed(1)} ms exceeds ${tripwire.boundMs} ms.`;
}

/** Announce only successfully published timing history, once per message in the current command. */
export function reportProjectionTripwires(root: Pick<ProjectionRootState, "checkout">, index: ProjectionIndex): void {
  const notices = projectionProcessState().notices;
  for (const tripwire of projectionTripwires(index.tripwires)) {
    const message = `${root.checkout}: ${formatProjectionTripwire(tripwire)}`;
    if (!notices.includes(message)) notices.push(message);
  }
}
