/** Canonical GitHub reads for the repository-only passive await launcher. */

import { parseAggregateAwaitState } from "../hosts/github/await-observation.js";
import { GITHUB_ACTIONS_APP_ID } from "../hosts/github/ci.js";
import type { AwaitConclusion, AwaitHostPort, ReviewAwaitState, WaitRead } from "./await.js";
import { GhProcessError, type GhDeveloperActionPort } from "./gh-action-port.js";

interface AwaitCheckScope {
  expectedAppId: string;
  contextName: "merge-ok" | "review-gate-shadow";
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("malformed-github-read");
  return value as Record<string, unknown>;
}

function repositoryPath(repositoryRef: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repositoryRef)) throw new Error("invalid-repository-ref");
  return `repos/${repositoryRef}`;
}

function checks(value: unknown): unknown[] {
  const values = record(value).check_runs;
  if (!Array.isArray(values)) throw new Error("malformed-github-checks");
  return values;
}

function ciState(values: unknown[], headSha: string): AwaitConclusion {
  const matches = values.flatMap((value) => {
    const item = record(value);
    const app = record(item.app);
    return item.name === "ci-ok" && item.head_sha === headSha && String(app.id) === GITHUB_ACTIONS_APP_ID
      ? [item]
      : [];
  }).sort((left, right) => String(right.started_at).localeCompare(String(left.started_at))
    || Number(right.id) - Number(left.id));
  const current = matches[0];
  if (current === undefined || current.status !== "completed" || typeof current.conclusion !== "string") return "pending";
  return current.conclusion === "success" ? "success" : "failure";
}

/** `gh api`-backed canonical reads with failures normalized for the await runtime. */
export class GhAwaitHostPort implements AwaitHostPort {
  private readonly gh: GhDeveloperActionPort;
  private readonly scope: AwaitCheckScope;

  constructor(gh: GhDeveloperActionPort, scope: AwaitCheckScope) {
    this.gh = gh;
    this.scope = scope;
  }

  async readPullRequestHead(
    repositoryRef: string,
    pullRequestNumber: number,
    options?: { signal?: AbortSignal },
  ): Promise<WaitRead<string>> {
    try {
      const pull = record(await this.gh.readJson(`${repositoryPath(repositoryRef)}/pulls/${pullRequestNumber}`, options));
      const head = record(pull.head).sha;
      return typeof head === "string" && /^[a-f0-9]{40}$/u.test(head)
        ? { kind: "ok", value: head }
        : { kind: "malformed-projection" };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof GhProcessError) return { kind: error.kind };
      return error instanceof SyntaxError || (error instanceof Error && error.message.includes("malformed"))
        ? { kind: "malformed-projection" }
        : { kind: "host-failure" };
    }
  }

  async readCiState(
    repositoryRef: string,
    headSha: string,
    options?: { signal?: AbortSignal },
  ): Promise<WaitRead<AwaitConclusion>> {
    try {
      const values = checks(await this.gh.readJson(
        `${repositoryPath(repositoryRef)}/commits/${headSha}/check-runs?app_id=${GITHUB_ACTIONS_APP_ID}&check_name=ci-ok&filter=all&per_page=100`,
        options,
      ));
      return { kind: "ok", value: ciState(values, headSha) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof GhProcessError) return { kind: error.kind };
      return error instanceof SyntaxError || (error instanceof Error && error.message.includes("malformed"))
        ? { kind: "malformed-projection" }
        : { kind: "host-failure" };
    }
  }

  async readReviewState(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    headSha: string;
  }, options?: { signal?: AbortSignal }): Promise<WaitRead<ReviewAwaitState>> {
    try {
      const values = checks(await this.gh.readJson(
        `${repositoryPath(input.repositoryRef)}/commits/${input.headSha}/check-runs?app_id=${this.scope.expectedAppId}&check_name=${this.scope.contextName}&filter=all&per_page=100`,
        options,
      ));
      return { kind: "ok", value: parseAggregateAwaitState(values, { ...this.scope, ...input }) };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof GhProcessError) return { kind: error.kind };
      return error instanceof Error && error.message.includes("malformed")
        ? { kind: "malformed-projection" }
        : { kind: "host-failure" };
    }
  }
}
