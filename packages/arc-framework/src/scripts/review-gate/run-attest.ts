/** GitHub Actions shell for authenticated attestation dispatch. */

import { readFile } from "node:fs/promises";

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { runAttestMain } from "./runtime/attest-main.js";
import { createAttestRuntime } from "./runtime/composition.js";
import { createAuthenticatedGitExec, productionFetch } from "./runtime/production-io.js";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (eventPath === undefined || eventPath.length === 0) throw new Error("missing-environment:GITHUB_EVENT_PATH");
const event = JSON.parse(await readFile(eventPath, "utf8")) as unknown;
const result = await runAttestMain(process.env, event, {
  createRuntime: createAttestRuntime,
  fetch: productionFetch,
  createGitExec: (gitToken) => createAuthenticatedGitExec(gitToken),
  policy: SELF_HOSTING_POLICY,
  now: new Date(),
});
process.stdout.write(JSON.stringify(result));
