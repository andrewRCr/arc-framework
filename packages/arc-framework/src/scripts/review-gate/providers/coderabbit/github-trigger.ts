/** GitHub-backed CodeRabbit trigger transport for the repository-owned handshake. */

import type { ReviewRequest } from "../../core/execution.js";
import { arrayAt, integerAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import type { GitHubRestClient, WriteOutcome } from "../../hosts/github/api/rest.js";
import type { TriggerOutcome } from "./adapter.js";

const TRIGGER_LABEL = "arc-review-gate";
const FULL_REVIEW_COMMAND = "@coderabbitai full review";

/** Live canonical request lookup supplied by the runtime/factory. */
export interface CodeRabbitRequestLocator {
  resolve(request: ReviewRequest): Promise<{
    state: "current" | "replay" | "stale";
    pullNumber: number;
  }>;
}

/** Dependencies pinned to one repository for GitHub-hosted trigger effects. */
export interface GitHubCodeRabbitTriggerDeps {
  rest: GitHubRestClient;
  owner: string;
  repo: string;
  locator: CodeRabbitRequestLocator;
}

function repositoryPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

function writeOutcome<T>(outcome: WriteOutcome<T>): TriggerOutcome {
  switch (outcome.kind) {
    case "ok":
      throw new Error("write outcome requires an acknowledgement mapper");
    case "ambiguous":
      return { kind: "ambiguous" };
    case "rate-limited":
      return { kind: "rejected", reason: "rate-limited" };
    case "http-error":
      return { kind: "rejected", reason: `http-${outcome.status}` };
    case "schema-error":
      return { kind: "rejected", reason: "malformed-response" };
  }
}

/** Concrete GitHub mutation boundary for the configured label and full-review command. */
export class GitHubCodeRabbitTriggerApi {
  private readonly rest: GitHubRestClient;
  private readonly path: string;
  private readonly locator: CodeRabbitRequestLocator;

  constructor(input: GitHubCodeRabbitTriggerDeps) {
    this.rest = input.rest;
    this.path = repositoryPath(input.owner, input.repo);
    this.locator = input.locator;
  }

  async validateCurrent(request: ReviewRequest): Promise<"current" | "replay" | "stale"> {
    return (await this.locator.resolve(request)).state;
  }

  async applyTriggerLabel(request: ReviewRequest): Promise<TriggerOutcome> {
    const current = await this.locator.resolve(request);
    if (current.state !== "current") return { kind: "rejected", reason: current.state };
    const outcome = await this.rest.write("POST", `${this.path}/issues/${current.pullNumber}/labels`, {
      body: { labels: [TRIGGER_LABEL] },
      parse: (value) => {
        const labels = arrayAt(value, "labels", (label, path) => stringAt(objectAt(label, path).name, `${path}.name`));
        if (!labels.includes(TRIGGER_LABEL)) throw new Error("trigger label was not acknowledged");
        return labels;
      },
      reconcile: () => Promise.resolve({ kind: "unavailable", reason: "network" }),
    });
    if (outcome.kind !== "ok") return writeOutcome(outcome);
    return {
      kind: "acknowledged",
      acknowledgedAt: new Date().toISOString(),
      durableRef: `github-label:${current.pullNumber}:${TRIGGER_LABEL}`,
    };
  }

  async removeTriggerLabel(request: ReviewRequest): Promise<void> {
    const current = await this.locator.resolve(request);
    if (current.state !== "current") throw new Error(`trigger-label-remove-${current.state}`);
    const outcome = await this.rest.write("DELETE", `${this.path}/issues/${current.pullNumber}/labels/${TRIGGER_LABEL}`, {
      parse: (value) => arrayAt(value, "labels", (label, path) => stringAt(objectAt(label, path).name, `${path}.name`)),
    });
    if (outcome.kind !== "ok") throw new Error(`trigger-label-remove-${writeOutcome(outcome).kind}`);
  }

  async requestFullReview(request: ReviewRequest): Promise<TriggerOutcome> {
    const current = await this.locator.resolve(request);
    if (current.state !== "current") return { kind: "rejected", reason: current.state };
    const outcome = await this.rest.write("POST", `${this.path}/issues/${current.pullNumber}/comments`, {
      body: { body: FULL_REVIEW_COMMAND },
      parse: (value) => {
        const record = objectAt(value, "comment");
        return {
          id: integerAt(record.id, "comment.id", 1),
          nodeId: stringAt(record.node_id, "comment.node_id"),
          url: stringAt(record.html_url, "comment.html_url"),
          createdAt: timestampAt(record.created_at, "comment.created_at"),
        };
      },
    });
    if (outcome.kind !== "ok") return writeOutcome(outcome);
    return {
      kind: "acknowledged",
      acknowledgedAt: outcome.value.createdAt,
      durableRef: outcome.value.url,
    };
  }
}
