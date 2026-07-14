/** Protected Actions shell for sanitized forced-format App-token qualification. */

import { appendFile, writeFile } from "node:fs/promises";

import { GitHubRestClient } from "./hosts/github/api/rest.js";
import { qualifyInstallationToken } from "./hosts/github/token-qualification.js";
import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import {
  createAppJwt,
  mintQualificationToken,
  resolveQualificationInstallation,
} from "./runtime/github-app-mint.js";
import { productionFetch } from "./runtime/production-io.js";
import { SELF_HOSTING_REVIEW_GATE } from "./runtime/entrypoints.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

const repositoryRef = required("GITHUB_REPOSITORY");
const [owner, repo, ...extra] = repositoryRef.split("/");
if (owner === undefined || repo === undefined || extra.length > 0) throw new Error("invalid-GITHUB_REPOSITORY");
const repositoryId = required("ARC_REPOSITORY_ID");
if (!/^[1-9][0-9]*$/u.test(repositoryId)) throw new Error("invalid-ARC_REPOSITORY_ID");
const expectedAppId = required("ARC_REVIEW_GATE_APP_ID");
const jwt = createAppJwt(required("ARC_REVIEW_GATE_APP_CLIENT_ID"), required("ARC_REVIEW_GATE_APP_PRIVATE_KEY"), new Date());
const installation = await resolveQualificationInstallation({ fetch: productionFetch, jwt, owner, repo });
if (installation.appId !== expectedAppId) throw new Error("token-qualification:app-id-mismatch");

const result = await SELF_HOSTING_REVIEW_GATE.runTokenQualification({
  mint: (format) => mintQualificationToken({
    fetch: productionFetch,
    jwt,
    installationId: installation.installationId,
    repository: repo,
    format,
  }),
  consume: (token) => qualifyInstallationToken({
    rest: new GitHubRestClient({ fetch: productionFetch, token }),
    expectedAppId,
    expectedAppSlug: installation.appSlug,
    expectedBotId: SELF_HOSTING_POLICY.providerIdentities.appBotUserId,
    expectedRepositoryId: repositoryId,
    owner,
    repo,
  }),
});
const serialized = `${JSON.stringify(result)}\n`;
await writeFile(required("ARC_QUALIFICATION_RESULT"), serialized, { encoding: "utf8", mode: 0o600 });
await appendFile(required("GITHUB_OUTPUT"), `result=${JSON.stringify(result)}\n`, "utf8");
process.stdout.write(JSON.stringify({ status: result.status, formats: result.probes.map((probe) => probe.observedFormat) }));
