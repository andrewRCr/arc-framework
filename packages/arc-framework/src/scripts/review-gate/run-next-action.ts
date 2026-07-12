/** Repository-only next-action launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { createReadOnlyNextActionReader } from "./runtime/action-composition.js";
import { runNextAction } from "./runtime/action-main.js";
import { parseContextMode } from "./runtime/rollout.js";
import {
  createAuthenticatedGitExec,
  productionFetch,
  productionProcessRunner,
} from "./runtime/production-io.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

function positiveInteger(name: string): number {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid-environment:${name}`);
  return value;
}

const repositoryRef = required("GITHUB_REPOSITORY");
const [owner, repo, ...rest] = repositoryRef.split("/");
if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0 || rest.length > 0) {
  throw new Error("invalid-environment:GITHUB_REPOSITORY");
}
const token = (await productionProcessRunner.run("gh", ["auth", "token"])).stdout.trim();
if (token.length === 0) throw new Error("gh-auth-token-empty");
const repositoryId = positiveInteger("ARC_REPOSITORY_ID");
const pullRequestNumber = positiveInteger("ARC_PULL_REQUEST_NUMBER");
const reader = await createReadOnlyNextActionReader({
  owner,
  repo,
  repositoryId,
  pullRequestNumber,
  token,
  appSlug: required("ARC_APP_SLUG"),
  expectedAppId: required("ARC_REVIEW_GATE_APP_ID"),
  policy: SELF_HOSTING_POLICY,
  mode: parseContextMode(process.env.REVIEW_GATE_CONTEXT_MODE),
  fetch: productionFetch,
  exec: createAuthenticatedGitExec(token),
  now: () => new Date(),
});
const action = await runNextAction({
  repositoryId: String(repositoryId),
  changeRequestId: required("ARC_CHANGE_REQUEST_ID"),
  headSha: required("ARC_HEAD_SHA"),
}, reader);
process.stdout.write(`${JSON.stringify(action)}\n`);
