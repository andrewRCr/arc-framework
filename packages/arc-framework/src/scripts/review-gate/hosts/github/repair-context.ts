/** App-independent live GitHub context for bounded repair-attestation validation. */

import type { AttestationValidationContext, RepairAttestationContext } from "../../core/attestations.js";
import { meetsMinimumPermission, type CapabilitySet, type ReviewRequirement } from "../../core/contracts.js";
import { computeChangeSetId } from "../../core/identity.js";
import { arrayAt, digestAt, integerAt, objectAt, stringAt } from "../../core/validation.js";
import { resolveSelfHostingDecision } from "../../policy/self-hosting/decision.js";
import {
  deriveAcceptedReviewerClaims,
  type SelfHostingPolicy,
} from "../../policy/self-hosting/schema.js";
import { resolveActorCapabilities } from "./actor.js";
import type { GitHubRestClient, ReadOutcome } from "./api/rest.js";

export interface RepairActorAddress { login: string; expectedActorId: string }

export interface RepairContextApi {
  readRepository(): Promise<{ repositoryId: string; defaultBranch: string }>;
  readPullRequest(pullRequestNumber: number): Promise<{
    changeRequestId: string;
    headSha: string;
    baseRef: string;
    baseSha: string;
    diffBaseSha: string;
    authorIdentity: string;
    changedPaths: string[];
  }>;
  readWorkflowRun(runId: string): Promise<{
    runId: string;
    runAttempt: number;
    event: "workflow_dispatch";
    workflowPath: string;
    workflowSha: string;
    dispatchRef: string;
  }>;
  resolveActorCapabilities(actor: RepairActorAddress): Promise<CapabilitySet>;
}

function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function valueOrThrow<T>(outcome: ReadOutcome<T>, locus: string): T {
  if (outcome.kind !== "ok") throw new Error(`repair-context:${locus}-unavailable:${outcome.kind}`);
  return outcome.value;
}

/** Read-only GitHub implementation usable with the workflow's ordinary `GITHUB_TOKEN`. */
export class GitHubRestRepairContextApi implements RepairContextApi {
  constructor(
    private readonly rest: GitHubRestClient,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async readRepository(): Promise<{ repositoryId: string; defaultBranch: string }> {
    return valueOrThrow(await this.rest.get(`/repos/${segment(this.owner)}/${segment(this.repo)}`, {
      parse: (input) => {
        const record = objectAt(input, "repository");
        return {
          repositoryId: String(integerAt(record.id, "repository.id", 1)),
          defaultBranch: stringAt(record.default_branch, "repository.default_branch"),
        };
      },
    }), "repository");
  }

  async readPullRequest(pullRequestNumber: number): Promise<{
    changeRequestId: string;
    headSha: string;
    baseRef: string;
    baseSha: string;
    diffBaseSha: string;
    authorIdentity: string;
    changedPaths: string[];
  }> {
    const root = `/repos/${segment(this.owner)}/${segment(this.repo)}`;
    const pull = valueOrThrow(await this.rest.get(`${root}/pulls/${segment(pullRequestNumber)}`, {
      parse: (input) => {
        const record = objectAt(input, "pullRequest");
        const head = objectAt(record.head, "pullRequest.head");
        const base = objectAt(record.base, "pullRequest.base");
        const author = objectAt(record.user, "pullRequest.user");
        return {
          changeRequestId: stringAt(record.node_id, "pullRequest.node_id"),
          headSha: digestAt(head.sha, "pullRequest.head.sha", 40),
          baseRef: stringAt(base.ref, "pullRequest.base.ref"),
          baseSha: digestAt(base.sha, "pullRequest.base.sha", 40),
          authorIdentity: String(integerAt(author.id, "pullRequest.user.id", 1)),
        };
      },
    }), "pull-request");
    const [comparison, changedPaths] = await Promise.all([
      this.rest.get(`${root}/compare/${segment(pull.baseSha)}...${segment(pull.headSha)}`, {
        parse: (input) => {
          const record = objectAt(input, "comparison");
          const mergeBase = objectAt(record.merge_base_commit, "comparison.merge_base_commit");
          return digestAt(mergeBase.sha, "comparison.merge_base_commit.sha", 40);
        },
      }),
      this.rest.getPaginated(`${root}/pulls/${segment(pullRequestNumber)}/files`, {
        query: { per_page: 100 },
        parsePage: (input) => arrayAt(input, "files", (item, path) => {
          const record = objectAt(item, path);
          return [
            stringAt(record.filename, `${path}.filename`),
            ...(record.previous_filename === undefined
              ? []
              : [stringAt(record.previous_filename, `${path}.previous_filename`)]),
          ];
        }).flat(),
      }),
    ]);
    return {
      ...pull,
      diffBaseSha: valueOrThrow(comparison, "comparison"),
      changedPaths: valueOrThrow(changedPaths, "changed-paths"),
    };
  }

  async readWorkflowRun(runId: string): Promise<{
    runId: string;
    runAttempt: number;
    event: "workflow_dispatch";
    workflowPath: string;
    workflowSha: string;
    dispatchRef: string;
  }> {
    return valueOrThrow(await this.rest.get(
      `/repos/${segment(this.owner)}/${segment(this.repo)}/actions/runs/${segment(runId)}`,
      {
        parse: (input) => {
          const record = objectAt(input, "workflowRun");
          const event = stringAt(record.event, "workflowRun.event");
          if (event !== "workflow_dispatch") throw new Error("workflowRun.event: expected workflow_dispatch");
          return {
            runId: String(integerAt(record.id, "workflowRun.id", 1)),
            runAttempt: integerAt(record.run_attempt, "workflowRun.run_attempt", 1),
            event,
            workflowPath: stringAt(record.path, "workflowRun.path"),
            workflowSha: digestAt(record.head_sha, "workflowRun.head_sha", 40),
            dispatchRef: stringAt(record.head_branch, "workflowRun.head_branch"),
          };
        },
      },
    ), "workflow-run");
  }

  async resolveActorCapabilities(actor: RepairActorAddress): Promise<CapabilitySet> {
    const result = await resolveActorCapabilities({
      rest: this.rest,
      owner: this.owner,
      repo: this.repo,
      login: actor.login,
      expectedActorId: actor.expectedActorId,
    });
    if (result.kind !== "resolved") throw new Error(`repair-context:actor-unavailable:${result.kind}`);
    return result.capabilities;
  }
}

export interface RepairContextInput {
  repositoryId: string;
  pullRequestNumber: number;
  actor: RepairActorAddress;
  runId: string;
  authorityPaths: string[];
  policy: SelfHostingPolicy;
  workflowPath?: string;
}

export interface RepairAttestationResolution extends Omit<
  AttestationValidationContext,
  "usedRunIds" | "now" | "purpose" | "repair"
> {
  purpose: "repair-authority";
  repair: RepairAttestationContext;
}

/** Resolve all repair authority from live GitHub state without ARC App credentials. */
export async function resolveRepairAttestationContext(
  input: RepairContextInput,
  api: RepairContextApi,
): Promise<RepairAttestationResolution> {
  const [repository, pullRequest, workflowRun, authenticatedActor] = await Promise.all([
    api.readRepository(),
    api.readPullRequest(input.pullRequestNumber),
    api.readWorkflowRun(input.runId),
    api.resolveActorCapabilities(input.actor),
  ]);
  if (repository.repositoryId !== input.repositoryId) throw new Error("repair-context:repository-identity-mismatch");
  const expectedWorkflowPath = input.workflowPath ?? ".github/workflows/review-gate-repair.yml";
  if (workflowRun.runId !== input.runId
    || workflowRun.workflowPath !== expectedWorkflowPath
    || workflowRun.dispatchRef !== repository.defaultBranch) {
    throw new Error("repair-context:workflow-run-mismatch");
  }
  const nonAuthorWrite = authenticatedActor.actorIdentity !== pullRequest.authorIdentity
    && authenticatedActor.permissions.some((permission) => meetsMinimumPermission(permission, "write"));
  const maintainer = authenticatedActor.permissions.some((permission) => meetsMinimumPermission(permission, "maintain"));
  if (!maintainer && !nonAuthorWrite) throw new Error("repair-context:actor-not-authorized");
  if (authenticatedActor.actorIdentity === pullRequest.authorIdentity) {
    throw new Error("repair-context:author-cannot-self-authorize");
  }

  const changeSetId = computeChangeSetId({
    baseRef: pullRequest.baseRef,
    diffBaseSha: pullRequest.diffBaseSha,
    headSha: pullRequest.headSha,
  });
  const decision = resolveSelfHostingDecision({
    policy: input.policy,
    changeRequest: {
      schemaVersion: 1,
      repositoryId: repository.repositoryId,
      changeRequestId: pullRequest.changeRequestId,
      hostRef: `repair:${repository.repositoryId}:${input.pullRequestNumber}`,
      baseRef: pullRequest.baseRef,
      baseSha: pullRequest.baseSha,
      diffBaseSha: pullRequest.diffBaseSha,
      headSha: pullRequest.headSha,
      changeSetId,
    },
    lane: { lane: "reviewed", reasons: ["non-lane-path"] },
    risk: { risk: "sensitive", reasons: ["code-surface"] },
  });
  const requirement: ReviewRequirement | undefined = decision.requirements[0];
  if (requirement === undefined || decision.requirements.length !== 1) {
    throw new Error("repair-context:requirement-unavailable");
  }
  const changedPaths = new Set(pullRequest.changedPaths);
  const authorityCodeUnchanged = input.authorityPaths.every((path) => !changedPaths.has(path));
  if (!authorityCodeUnchanged) throw new Error("repair-context:authority-code-changed");

  return {
    requirement,
    authenticatedActor,
    acceptedReviewerClaims: deriveAcceptedReviewerClaims(input.policy),
    acceptedRuntimeKinds: input.policy.attestationEnforcement.acceptedRuntimeKinds,
    authorIdentity: pullRequest.authorIdentity,
    maxRunAgeMinutes: input.policy.attestationEnforcement.maxRunAgeMinutes,
    purpose: "repair-authority",
    repair: {
      repositoryId: repository.repositoryId,
      changeRequestOrdinal: input.pullRequestNumber,
      controllerExecutionId: workflowRun.runId,
      controllerExecutionAttempt: workflowRun.runAttempt,
      controllerDefinitionRef: workflowRun.workflowPath,
      controllerDefinitionSha: workflowRun.workflowSha,
      authorityCodeUnchanged,
    },
  };
}
