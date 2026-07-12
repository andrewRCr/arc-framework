/** GitHub Actions validation shell for the App-independent repair status. */

import { appendFile, readFile, readdir } from "node:fs/promises";

import { GitHubRestClient } from "./hosts/github/api/rest.js";
import { auditRepairWriterGraph, GitHubRestRepairAuditFacts } from "./hosts/github/repair-audit.js";
import { resolveRepairAttestationContext, GitHubRestRepairContextApi } from "./hosts/github/repair-context.js";
import { GitHubRestRepairEnvironmentApi, verifyRepairEnvironment } from "./hosts/github/repair-environment.js";
import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { productionFetch } from "./runtime/production-io.js";
import { parseRepairDispatchEvent, validateRepairDispatch } from "./runtime/repair-main.js";

const AUTHORITY_PATHS = [
  ".github/workflows/review-gate-repair.yml",
  "packages/arc-framework/src/scripts/review-gate/core/attestations.ts",
  "packages/arc-framework/src/scripts/review-gate/hosts/github/repair-audit.ts",
  "packages/arc-framework/src/scripts/review-gate/hosts/github/repair-context.ts",
  "packages/arc-framework/src/scripts/review-gate/hosts/github/repair-environment.ts",
  "packages/arc-framework/src/scripts/review-gate/run-repair-environment.ts",
  "packages/arc-framework/src/scripts/review-gate/runtime/repair-main.ts",
  "packages/arc-framework/src/scripts/review-gate/run-repair.ts",
];

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

const event = parseRepairDispatchEvent(JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8")) as unknown);
const repository = required("GITHUB_REPOSITORY");
const [owner, repo, ...extra] = repository.split("/");
if (owner === undefined || repo === undefined || extra.length > 0) throw new Error("invalid-GITHUB_REPOSITORY");
const token = required("GITHUB_TOKEN");
const rest = new GitHubRestClient({ fetch: productionFetch, token });
const liveFacts = await new GitHubRestRepairAuditFacts(rest, owner, repo).read();
const contextApi = new GitHubRestRepairContextApi(rest, owner, repo);
const environmentApi = new GitHubRestRepairEnvironmentApi(rest, owner, repo);
const workflowFiles: Record<string, string> = {};
for (const name of await readdir(".github/workflows")) {
  if (!/\.ya?ml$/u.test(name)) continue;
  const path = `.github/workflows/${name}`;
  workflowFiles[path] = await readFile(path, "utf8");
}
const authorityPaths = [...AUTHORITY_PATHS, ...Object.keys(workflowFiles)];
const workflowSha = required("GITHUB_WORKFLOW_SHA");
const result = await validateRepairDispatch({
  manifest: event.manifest,
  selectedRef: required("GITHUB_REF_NAME"),
  defaultBranch: liveFacts.defaultBranch,
}, {
  resolveContext: () => resolveRepairAttestationContext({
    repositoryId: event.repositoryId,
    pullRequestNumber: event.pullRequestNumber,
    actor: { login: event.actorLogin, expectedActorId: event.actorId },
    runId: required("GITHUB_RUN_ID"),
    authorityPaths,
    policy: SELF_HOSTING_POLICY,
  }, contextApi),
  usedRunIds: [],
  auditGraph: () => Promise.resolve(auditRepairWriterGraph({
    files: workflowFiles,
    repositoryDefaultPermission: liveFacts.repositoryDefaultPermission,
    auditedSha: workflowSha,
    liveDefaultBranchSha: liveFacts.liveDefaultBranchSha,
    repairWorkflowPath: ".github/workflows/review-gate-repair.yml",
    repairEnvironment: "review-gate-repair",
    changedPaths: [],
    authorityPaths,
  })),
  verifyEnvironment: async () => verifyRepairEnvironment(await environmentApi.read(), liveFacts.defaultBranch),
  now: new Date(),
});
const output = required("GITHUB_OUTPUT");
await appendFile(output, `head_sha=${result.headSha}\nvalidation_json=${JSON.stringify(result)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ status: result.status, headSha: result.headSha })}\n`);
