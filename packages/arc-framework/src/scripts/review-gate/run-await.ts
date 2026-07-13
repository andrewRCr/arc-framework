/** Repository-only passive await launcher using the current developer's `gh` session. */

import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { GhDeveloperActionPort } from "./runtime/gh-action-port.js";
import { GhAwaitHostPort } from "./runtime/gh-await-port.js";
import { productionProcessRunner } from "./runtime/production-io.js";
import { parseContextMode } from "./runtime/rollout.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

const pullRequestNumber = Number(required("ARC_PULL_REQUEST_NUMBER"));
if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) {
  throw new Error("invalid-environment:ARC_PULL_REQUEST_NUMBER");
}
const gh = new GhDeveloperActionPort(productionProcessRunner);
await gh.currentActorIdentity();
const contextName = parseContextMode(process.env.REVIEW_GATE_CONTEXT_MODE) === "final" ? "merge-ok" : "review-gate-shadow";
await SELF_HOSTING_REVIEW_GATE.runAwaitMain({
  args: process.argv.slice(2),
  repositoryRef: required("GITHUB_REPOSITORY"),
  pullRequestNumber,
  host: new GhAwaitHostPort(gh, { expectedAppId: required("ARC_REVIEW_GATE_APP_ID"), contextName }),
  clock: { now: () => Date.now(), sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) },
  write: (line) => { process.stdout.write(`${line}\n`); },
});
