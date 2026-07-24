/** Developer-authenticated GitHub port for exact-head clearance dispatch. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import type {
  ReviewUnlockDispatchPayload,
  ReviewUnlockPort,
  WorkflowInspection,
} from "../../unlock.js";
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

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
}

/** `gh` implementation of the unlock boundary; readiness remains the shared local evaluator. */
export class GhReviewUnlockPort implements ReviewUnlockPort {
  constructor(
    private readonly runner: HostedProcessRunner,
    private readonly readiness: (request: ReviewReadinessRequest) => Promise<ReviewReadinessEnvelope>,
  ) {}

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

  async resolvePullRequest(repository: string, pullRequest: number) {
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
    };
  }

  async inspectWorkflow(input: {
    repository: string;
    ref: string;
    path: ".github/workflows/arc-clearance.yml";
  }): Promise<WorkflowInspection> {
    try {
      const result = await this.runner.run([
        "api",
        `repos/${input.repository}/contents/${input.path}`,
        "--method",
        "GET",
        "--raw-field",
        `ref=${input.ref}`,
      ]);
      const value = parse(result.stdout, "workflow");
      if (typeof value !== "object" || value === null || Array.isArray(value)) return { state: "ambiguous" };
      const record = value as Record<string, unknown>;
      return record.type === "file"
        && record.path === input.path
        && typeof record.sha === "string"
        && record.sha.length > 0
        ? { state: "present" }
        : { state: "ambiguous" };
    } catch (error) {
      return /\b(?:HTTP )?404\b/u.test(error instanceof Error ? error.message : String(error))
        ? { state: "absent" }
        : { state: "unreadable" };
    }
  }

  checkReadiness(request: ReviewReadinessRequest): Promise<ReviewReadinessEnvelope> {
    return this.readiness(request);
  }

  async dispatch(payload: ReviewUnlockDispatchPayload): Promise<void> {
    const args = [
      "api",
      `repos/${payload.repository}/dispatches`,
      "--method",
      "POST",
      "--raw-field",
      `event_type=${payload.eventType}`,
      "--raw-field",
      `client_payload[repository]=${payload.repository}`,
      "--field",
      `client_payload[pull_request]=${payload.pullRequest}`,
      "--raw-field",
      `client_payload[head_sha]=${payload.headSha}`,
      "--raw-field",
      `client_payload[vehicle_kind]=${payload.vehicle.kind}`,
      "--raw-field",
      `client_payload[slug]=${payload.vehicle.slug}`,
    ];
    if (payload.vehicle.kind === "work-unit") {
      args.push("--raw-field", `client_payload[archive_cadence]=${payload.vehicle.archiveCadence}`);
    }
    await this.runner.run(args);
  }
}
