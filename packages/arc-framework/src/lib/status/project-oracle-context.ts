/** Shared non-work-unit inputs for project-readiness oracle composition. */

import { projectTransientInFlightRead, readTransientInFlightIndexes } from "../errand/record.js";
import type { GitExec } from "../git/exec.js";
import { readConfiguredIdentity } from "../git/identity.js";

/** Errand classification inputs shared by worktree- and index-backed renders. */
export interface ProjectErrandOracleContext {
  errandSlugByBranch: ReadonlyMap<string, string>;
  errandRecordsComplete: boolean;
}

/**
 * Resolve the identity-scoped errand records used to classify typed branches.
 *
 * @param exec - Git boundary used for identity and notes-ref reads
 * @returns Complete or explicitly degraded errand classification inputs
 */
export async function resolveProjectErrandOracleContext(exec: GitExec): Promise<ProjectErrandOracleContext> {
  let identity: string | null = null;
  let identityReadFailed = false;
  try {
    identity = await readConfiguredIdentity(exec);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "identity.invalid") throw error;
    identityReadFailed = true;
  }
  if (identityReadFailed) {
    return { errandSlugByBranch: new Map(), errandRecordsComplete: false };
  }
  const transient = projectTransientInFlightRead(await readTransientInFlightIndexes({ exec, identity }));
  return {
    errandSlugByBranch: transient.indexes.slugByBranch,
    errandRecordsComplete: transient.complete,
  };
}
