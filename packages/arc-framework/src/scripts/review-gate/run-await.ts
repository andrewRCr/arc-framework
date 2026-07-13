/** Repository-only passive await launcher using the current developer's `gh` session. */

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";
import { GhDeveloperActionPort } from "./runtime/gh-action-port.js";
import { GhAwaitHostPort } from "./runtime/gh-await-port.js";
import { resolveLocalReviewContext } from "./runtime/local-review-context.js";
import { productionProcessRunner } from "./runtime/production-io.js";
import { parseContextMode } from "./runtime/rollout.js";

const hostRef = process.argv[2];
if (hostRef === undefined) throw new Error("usage: run-await.ts <host-ref> <ci|review> --head <sha>");
const context = await resolveLocalReviewContext({
  hostRef,
  appBotUserId: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
  process: productionProcessRunner,
});
const gh = new GhDeveloperActionPort(productionProcessRunner);
await gh.currentActorIdentity();
const contextName = parseContextMode(process.env.REVIEW_GATE_CONTEXT_MODE) === "final" ? "merge-ok" : "review-gate-shadow";
await SELF_HOSTING_REVIEW_GATE.runAwaitMain({
  args: process.argv.slice(3),
  repositoryRef: context.repositoryRef,
  pullRequestNumber: context.pullRequestNumber,
  host: new GhAwaitHostPort(gh, { expectedAppId: context.expectedAppId, contextName }),
  clock: { now: () => Date.now(), sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) },
  write: (line) => { process.stdout.write(`${line}\n`); },
});
