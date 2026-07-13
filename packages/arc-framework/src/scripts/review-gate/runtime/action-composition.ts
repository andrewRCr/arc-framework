/** Read-only composition for developer-authenticated next-action resolution. */

import type { GitExec } from "../../../lib/git/exec.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import type { SelfHostingPolicy } from "../policy/self-hosting/schema.js";
import { createReconcileRuntime } from "./composition.js";
import { ReconcileNextActionReader, type NextActionReader } from "./action-main.js";
import type { ContextMode } from "./rollout.js";

/** Read-only controller coordinates supplied by the local launcher. */
export interface NextActionCompositionInput {
  owner: string;
  repo: string;
  repositoryId: number;
  pullRequestNumber: number;
  token: string;
  appSlug: string;
  expectedAppId: string;
  policy: SelfHostingPolicy;
  mode: ContextMode;
  fetch: HttpFetch;
  exec: GitExec;
  now: () => Date;
}

/** Build a reader that cannot expose the write-capable reconcile runtime. */
export async function createReadOnlyNextActionReader(
  input: NextActionCompositionInput,
): Promise<NextActionReader> {
  const composition = await createReconcileRuntime({
    owner: input.owner,
    repo: input.repo,
    repositoryId: input.repositoryId,
    pullRequestNumber: input.pullRequestNumber,
    appToken: input.token,
    appSlug: input.appSlug,
    expectedAppId: input.expectedAppId,
    policy: input.policy,
    mode: input.mode,
  }, { fetch: input.fetch, exec: input.exec }, {
    // Read provenance is established from host records; no App write authority is granted or returned.
    verifyLaunchAuthority: () => Promise.resolve({ kind: "verified" }),
  });
  return new ReconcileNextActionReader(composition.runtime, input.now);
}
