/** GitHub Actions entry point for secretless discovery and per-PR reconciliation. */

import { appendFile, readFile } from "node:fs/promises";

import { SELF_HOSTING_POLICY } from "./policy/self-hosting/schema.js";
import { createReconcileRuntime } from "./runtime/composition.js";
import { createAuthenticatedGitExec, productionFetch } from "./runtime/production-io.js";
import { runReconcileMain } from "./runtime/reconcile-main.js";
import { discoverCandidates, type DiscoveryPort } from "./runtime/discovery.js";
import { normalizeWakeup } from "./runtime/wakeup.js";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${name}`);
  return value;
}

async function githubJson(path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${required("GITHUB_TOKEN")}`, "x-github-api-version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`github-read-failed:${response.status}`);
  return response.json();
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("invalid-github-list");
  return value;
}

function pullNumber(value: unknown): number {
  if (typeof value !== "object" || value === null || !("number" in value) || !Number.isSafeInteger(value.number)) {
    throw new Error("invalid-github-pull-request");
  }
  return value.number as number;
}

function discoveryPort(repository: string): DiscoveryPort {
  return {
    resolveOpenPullRequestsByHead: async (_repositoryId, headSha) => {
      return array(await githubJson(`/repos/${repository}/commits/${headSha}/pulls`)).map(pullNumber);
    },
    listOpenPullRequests: async function* () {
      for (let page = 1; page <= 20; page += 1) {
        const values = array(await githubJson(`/repos/${repository}/pulls?state=open&per_page=100&page=${page}`))
          .map(pullNumber);
        yield values;
        if (values.length < 100) return;
      }
      throw new Error("github-pagination-cap-exceeded");
    },
  };
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  if (operation === "discover") {
    const payload = JSON.parse(await readFile(required("GITHUB_EVENT_PATH"), "utf8")) as unknown;
    const hint = normalizeWakeup(required("GITHUB_EVENT_NAME"), payload);
    const candidates = await discoverCandidates(hint, discoveryPort(required("GITHUB_REPOSITORY")));
    await appendFile(required("GITHUB_OUTPUT"), `matrix=${JSON.stringify({ include: candidates })}\n`, "utf8");
    return;
  }
  if (operation === "reconcile") {
    const result = await runReconcileMain(process.env, {
      createRuntime: createReconcileRuntime,
      fetch: productionFetch,
      createGitExec: (gitToken) => createAuthenticatedGitExec(gitToken),
      policy: SELF_HOSTING_POLICY,
      now: new Date(),
    });
    process.stdout.write(JSON.stringify(result));
    return;
  }
  throw new Error("usage: run-reconcile.ts <discover|reconcile>");
}

await main();
