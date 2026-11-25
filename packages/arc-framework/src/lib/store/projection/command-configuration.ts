/** Retain one Git configuration observation for each checkout participating in a command. */
import type { ProjectionConfiguration } from "./configuration.js";
import { projectionProcessState } from "./process-state.js";

/** Share the observation between command entry and explicit status consumers. */
export async function observeProjectionConfiguration(checkout: string, read: () => Promise<ProjectionConfiguration>): Promise<ProjectionConfiguration> {
  const observations = projectionProcessState().configurations;
  const previous = observations.get(checkout);
  if (previous !== undefined) return previous;
  const pending = read();
  observations.set(checkout, pending);
  try { return await pending; }
  catch (error) {
    if (observations.get(checkout) === pending) observations.delete(checkout);
    throw error;
  }
}
