/** Repository-only next-action launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { parseContextMode } from "./runtime/rollout.js";
import {
  createAuthenticatedGitExec,
  productionFetch,
  productionProcessRunner,
} from "./runtime/production-io.js";
import { resolveLocalReviewContext } from "./runtime/local-review-context.js";

const hostRef = process.argv[2];
if (hostRef === undefined) throw new Error("usage: run-next-action.ts <host-ref>");
const context = await resolveLocalReviewContext({
  hostRef,
  appBotUserId: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
  process: productionProcessRunner,
});
const reader = await SELF_HOSTING_REVIEW_GATE.createReadOnlyNextActionReader({
  owner: context.owner,
  repo: context.repo,
  repositoryId: context.repositoryId,
  pullRequestNumber: context.pullRequestNumber,
  token: context.token,
  appSlug: context.appSlug,
  expectedAppId: context.expectedAppId,
  policy: SELF_HOSTING_POLICY,
  mode: parseContextMode(process.env.REVIEW_GATE_CONTEXT_MODE),
  fetch: productionFetch,
  exec: createAuthenticatedGitExec(context.token),
  now: () => new Date(),
});
const action = await SELF_HOSTING_REVIEW_GATE.runNextAction({
  repositoryId: String(context.repositoryId),
  changeRequestId: context.changeRequestId,
  headSha: context.headSha,
}, reader);
process.stdout.write(`${JSON.stringify(action)}\n`);
