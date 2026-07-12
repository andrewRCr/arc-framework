/** Operator shell for comparing or applying the protected repair environment contract. */

import { GitHubRestClient } from "./hosts/github/api/rest.js";
import { GitHubRestRepairContextApi } from "./hosts/github/repair-context.js";
import {
  GitHubRestRepairEnvironmentApi,
  provisionRepairEnvironment,
} from "./hosts/github/repair-environment.js";
import { productionFetch } from "./runtime/production-io.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--apply") || args.filter((argument) => argument === "--apply").length > 1) {
  throw new Error("usage: npm run review-gate:repair-environment -- [--apply]");
}
const repository = required("GITHUB_REPOSITORY");
const [owner, repo, ...extra] = repository.split("/");
if (owner === undefined || repo === undefined || extra.length > 0) throw new Error("invalid-GITHUB_REPOSITORY");

const rest = new GitHubRestClient({ fetch: productionFetch, token: required("GITHUB_TOKEN") });
const defaultBranch = (await new GitHubRestRepairContextApi(rest, owner, repo).readRepository()).defaultBranch;
const result = await provisionRepairEnvironment(
  args.includes("--apply") ? "apply" : "compare",
  defaultBranch,
  new GitHubRestRepairEnvironmentApi(rest, owner, repo),
);
process.stdout.write(`${JSON.stringify({ ...result, defaultBranch })}\n`);
if (result.status === "stop") process.exitCode = 1;
