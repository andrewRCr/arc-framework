/** Read-only production composition for exact-head mutability checks. */

import type { GitExec } from "../../../lib/git/exec.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import { encodeHostRef } from "../hosts/github/change-request.js";
import type { SelfHostingPolicy } from "../policy/self-hosting/schema.js";
import { createReconcileRuntime } from "./composition.js";
import type {
  HeadMutabilityReader,
  HeadMutabilitySnapshot,
} from "./head-mutability-main.js";
import type { ContextMode } from "./rollout.js";

export interface HeadMutabilityCompositionInput {
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
}

/** Build a canonical reader without returning receipt or host write capabilities. */
export async function createReadOnlyHeadMutabilityReader(
  input: HeadMutabilityCompositionInput,
): Promise<HeadMutabilityReader> {
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
    verifyLaunchAuthority: () => Promise.resolve({ kind: "verified" }),
    initializeLedgerAnchor: false,
  });
  const hostRef = encodeHostRef({ owner: input.owner, repo: input.repo, number: input.pullRequestNumber });
  return {
    read: async (): Promise<HeadMutabilitySnapshot> => {
      const resolved = await composition.host.resolveChangeRequest(hostRef);
      const ledger = await composition.store.readLedger(resolved.changeRequest.changeRequestId);
      if (ledger.kind !== "valid") throw new Error("head-mutability: receipt ledger unavailable");
      return {
        repositoryId: resolved.changeRequest.repositoryId,
        changeRequestId: resolved.changeRequest.changeRequestId,
        headSha: resolved.changeRequest.headSha,
        receipts: ledger.receipts.map((envelope) => envelope.receipt),
        observations: [],
      };
    },
  };
}
