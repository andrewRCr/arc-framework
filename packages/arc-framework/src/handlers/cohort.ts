/** Capability-gated cohort lifecycle command entry points. */
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { handleDormantStoreCommand } from "./store-command-support.js";

interface CohortOptions { yes?: boolean; json?: boolean }

/** Report the serving operation until cohort close is available. */
export function handleCohortClose(_cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  return handleDormantStoreCommand("cohort close", options.json === true, context);
}

/** Report the serving operation until cohort removal is available. */
export function handleCohortRemove(_cohort: string, options: CohortOptions, context?: InteractionContext): Promise<void> {
  return handleDormantStoreCommand("cohort remove", options.json === true, context);
}
