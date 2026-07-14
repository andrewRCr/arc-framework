/** Repository-only perform-action launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { GhDeveloperActionPort } from "./runtime/gh-action-port.js";
import { parseContextMode } from "./runtime/rollout.js";
import {
  createAuthenticatedGitExec,
  productionFetch,
  productionProcessRunner,
} from "./runtime/production-io.js";
import { resolveLocalReviewContext } from "./runtime/local-review-context.js";

const hostRef = process.argv[2];
const requestKey = process.argv[3];
const generation = Number(process.argv[4]);
if (requestKey === undefined || !/^[a-f0-9]{64}$/u.test(requestKey) || !Number.isSafeInteger(generation) || generation < 0) {
  throw new Error("usage: run-perform-action.ts <host-ref> <request-key> <generation>");
}
if (hostRef === undefined) throw new Error("usage: run-perform-action.ts <host-ref> <request-key> <generation>");
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
const result = await SELF_HOSTING_REVIEW_GATE.runPerformAction({
  repositoryRef: context.repositoryRef,
  pullRequestNumber: context.pullRequestNumber,
  repositoryId: String(context.repositoryId),
  changeRequestId: context.changeRequestId,
  headSha: context.headSha,
  requestKey,
  generation,
}, { reader, port: new GhDeveloperActionPort(productionProcessRunner), now: () => new Date() });
process.stdout.write(`${JSON.stringify(result)}\n`);
