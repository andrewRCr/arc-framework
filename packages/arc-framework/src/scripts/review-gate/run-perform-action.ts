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

const requestKey = process.argv[2];
const generation = Number(process.argv[3]);
if (requestKey === undefined || !/^[a-f0-9]{64}$/u.test(requestKey) || !Number.isSafeInteger(generation) || generation < 0) {
  throw new Error("usage: run-perform-action.ts <request-key> <generation>");
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
const reader = await SELF_HOSTING_REVIEW_GATE.createReadOnlyNextActionReader({
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
const result = await SELF_HOSTING_REVIEW_GATE.runPerformAction({
  repositoryRef,
  pullRequestNumber,
  repositoryId: String(repositoryId),
  changeRequestId: required("ARC_CHANGE_REQUEST_ID"),
  headSha: required("ARC_HEAD_SHA"),
  requestKey,
  generation,
}, { reader, port: new GhDeveloperActionPort(productionProcessRunner), now: () => new Date() });
process.stdout.write(`${JSON.stringify(result)}\n`);
