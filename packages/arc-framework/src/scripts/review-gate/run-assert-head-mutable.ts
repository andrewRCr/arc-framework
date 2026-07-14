/** Repository-only exact-head mutability launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { parseContextMode } from "./runtime/rollout.js";
import {
  createAuthenticatedGitExec,
  execFileGitExec,
  productionFetch,
  productionProcessRunner,
} from "./runtime/production-io.js";
import { resolveLocalCommit } from "./runtime/local-commit.js";
import { resolveLocalReviewContext } from "./runtime/local-review-context.js";

const hostRef = process.argv[2];
if (hostRef === undefined) {
  throw new Error("usage: run-assert-head-mutable.ts <host-ref> <proposed-commit-ish> [authorization-receipt-hash]");
}
const proposedCommitish = process.argv[3];
if (proposedCommitish === undefined) {
  throw new Error("usage: run-assert-head-mutable.ts <host-ref> <proposed-commit-ish> [authorization-receipt-hash]");
}
const proposedHeadSha = await resolveLocalCommit(execFileGitExec, proposedCommitish);
const authorizationReceiptHash = process.argv[4] ?? null;
if (authorizationReceiptHash !== null && !/^[a-f0-9]{64}$/u.test(authorizationReceiptHash)) {
  throw new Error("invalid-authorization-receipt-hash");
}
const context = await resolveLocalReviewContext({
  hostRef,
  appBotUserId: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
  process: productionProcessRunner,
});
const reader = await SELF_HOSTING_REVIEW_GATE.createReadOnlyHeadMutabilityReader({
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
});
const guard = await SELF_HOSTING_REVIEW_GATE.runAssertHeadMutable({
  repositoryId: String(context.repositoryId),
  changeRequestId: context.changeRequestId,
  currentHeadSha: context.headSha,
  proposedHeadSha,
  authorizationReceiptHash,
}, reader);
process.stdout.write(`${JSON.stringify(guard)}\n`);
if (guard.kind === "refuse") process.exitCode = 1;
