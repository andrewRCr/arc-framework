/** Developer-authenticated GitHub port for merge-lock state and transitions. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import type {
  MergeLockPort,
  MergeLockPullRequest,
  MergeLockSetting,
  MergeLockTransition,
} from "../../merge-lock.js";
import type {
  ReviewReadinessEnvelope,
  ReviewReadinessRequest,
} from "../../readiness.js";

function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${path}: expected a non-empty string`);
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${path}: expected an integer`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
  return value;
}

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
}

/**
 * `gh` implementation of the merge-lock boundary. Config resolution and
 * lifecycle readiness stay with the shared local collaborators.
 */
export class GhMergeLockPort implements MergeLockPort {
  constructor(
    private readonly runner: HostedProcessRunner,
    private readonly readiness: (request: ReviewReadinessRequest) => Promise<ReviewReadinessEnvelope>,
    private readonly config: (treeRoot: string) => Promise<MergeLockSetting>,
  ) {}

  readMergeLock(treeRoot: string): Promise<MergeLockSetting> {
    return this.config(treeRoot);
  }

  async resolveRepository(): Promise<{ repository: string; defaultBranch: string }> {
    const result = await this.runner.run([
      "repo",
      "view",
      "--json",
      "nameWithOwner,defaultBranchRef",
    ]);
    const repository = object(parse(result.stdout, "repository"), "repository");
    return {
      repository: string(repository.nameWithOwner, "repository.nameWithOwner"),
      defaultBranch: string(
        object(repository.defaultBranchRef, "repository.defaultBranchRef").name,
        "repository.defaultBranchRef.name",
      ),
    };
  }

  async resolvePullRequest(repository: string, pullRequest: number): Promise<MergeLockPullRequest> {
    const result = await this.runner.run(["api", `repos/${repository}/pulls/${pullRequest}`]);
    const value = object(parse(result.stdout, "pullRequest"), "pullRequest");
    const head = object(value.head, "pullRequest.head");
    const base = object(value.base, "pullRequest.base");
    return {
      repository: string(object(base.repo, "pullRequest.base.repo").full_name, "pullRequest.base.repo.full_name"),
      number: integer(value.number, "pullRequest.number"),
      state: string(value.state, "pullRequest.state") === "open" ? "open" as const : "closed" as const,
      headBranch: string(head.ref, "pullRequest.head.ref"),
      headSha: string(head.sha, "pullRequest.head.sha"),
      locked: boolean(value.draft, "pullRequest.draft"),
    };
  }

  checkReadiness(request: ReviewReadinessRequest): Promise<ReviewReadinessEnvelope> {
    return this.readiness(request);
  }

  async applyTransition(transition: MergeLockTransition): Promise<void> {
    const args = ["pr", "ready", String(transition.pullRequest), "--repo", transition.repository];
    if (transition.transition === "hold") args.push("--undo");
    await this.runner.run(args);
  }
}
