/** Repository-only exact-head mutability launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { createReadOnlyHeadMutabilityReader } from "./runtime/head-mutability-composition.js";
import { runAssertHeadMutable } from "./runtime/head-mutability-main.js";
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

function sha(value: string | undefined, label: string): string {
  if (value === undefined || !/^[a-f0-9]{40}$/u.test(value)) throw new Error(`invalid-${label}`);
  return value;
}

const proposedHeadSha = sha(process.argv[2], "proposed-head");
const authorizationReceiptHash = process.argv[3] ?? null;
if (authorizationReceiptHash !== null && !/^[a-f0-9]{64}$/u.test(authorizationReceiptHash)) {
  throw new Error("invalid-authorization-receipt-hash");
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
const reader = await createReadOnlyHeadMutabilityReader({
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
});
const guard = await runAssertHeadMutable({
  repositoryId: String(repositoryId),
  changeRequestId: required("ARC_CHANGE_REQUEST_ID"),
  currentHeadSha: sha(required("ARC_HEAD_SHA"), "current-head"),
  proposedHeadSha,
  authorizationReceiptHash,
}, reader);
process.stdout.write(`${JSON.stringify(guard)}\n`);
if (guard.kind === "refuse") process.exitCode = 1;
