/** GitHub transport composition for the secretless discovery entry operation. */

import type { HttpFetch } from "../hosts/github/api/http.js";
import { resolveMatrixOutput, type DiscoveryPort } from "./discovery.js";

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

async function githubJson(fetch: HttpFetch, token: string, path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`github-read-failed:${response.status}`);
  return JSON.parse(await response.text()) as unknown;
}

function discoveryPort(fetch: HttpFetch, token: string, repository: string): DiscoveryPort {
  return {
    resolveOpenPullRequestsByHead: async (_repositoryId, headSha) =>
      array(await githubJson(fetch, token, `/repos/${repository}/commits/${headSha}/pulls`)).map(pullNumber),
    listOpenPullRequests: async function* () {
      for (let page = 1; page <= 20; page += 1) {
        const values = array(await githubJson(
          fetch,
          token,
          `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`,
        )).map(pullNumber);
        yield values;
        if (values.length < 100) return;
      }
      throw new Error("github-pagination-cap-exceeded");
    },
  };
}

/** Resolve the optional matrix output through the production GitHub discovery transport. */
export function runDiscoveryMain(input: {
  eventName: string;
  payload: unknown;
  expectedAppId: number;
  repository: string;
  token: string;
  fetch: HttpFetch;
}): Promise<string | null> {
  return resolveMatrixOutput(
    input.eventName,
    input.payload,
    input.expectedAppId,
    discoveryPort(input.fetch, input.token, input.repository),
  );
}
