/** Preserve a command start's refusal evidence for consumers that require completed take-in. */
import type { Remedy } from "../refusal.js";
import { projectionProcessState } from "./process-state.js";

/** A start or index stop, independent of backend refusal vocabulary. */
export interface ProjectionStartRefusal {
  readonly code: "projection-not-started" | "projection-skipped" | "projection-refused";
  readonly condition: string;
  readonly remedy: Remedy;
}

/** Read start evidence without accessing a backend, resolving a root, or changing caller capability policy. */
export function projectionStartRefusal(command: string, checkout?: string): ProjectionStartRefusal | null {
  const state = projectionProcessState();
  if (state.start === null || (checkout !== undefined && state.command?.checkout !== checkout)) {
    return { code: "projection-not-started", condition: "The projection start has not run for this command and checkout.",
      remedy: { text: `Retry ${command} through its command entry.` } };
  }
  const start = state.start;
  if (start.kind !== "skipped" && start.kind !== "refused") return null;
  const mark = start.kind === "skipped" ? start.skip.mark : start.mark;
  return { code: start.kind === "skipped" ? "projection-skipped" : "projection-refused", condition: mark.reason, remedy: mark.remedy };
}
