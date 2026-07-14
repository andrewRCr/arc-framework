import { describe, expect, it } from "vitest";

import { computeChangeSetId, computePolicyVersion } from "../../../../../../src/scripts/review-gate/core/identity.js";
import { resolveRepairAttestationContext } from "../../../../../../src/scripts/review-gate/hosts/github/repair-context.js";
import { SELF_HOSTING_POLICY } from "../../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";

const HEAD = "c".repeat(40);
const DIFF_BASE = "d".repeat(40);
const WORKFLOW_SHA = "e".repeat(40);

function api(overrides: Record<string, unknown> = {}) {
  return {
    readRepository: async () => ({ repositoryId: "100", defaultBranch: "main" }),
    readPullRequest: async () => ({
      changeRequestId: "PR_node",
      headSha: HEAD,
      baseRef: "main",
      baseSha: "b".repeat(40),
      diffBaseSha: DIFF_BASE,
      authorIdentity: "author-1",
      changedPaths: ["src/a.ts"],
    }),
    readWorkflowRun: async () => ({
      runId: "9001",
      runAttempt: 2,
      event: "workflow_dispatch" as const,
      workflowPath: ".github/workflows/review-gate-repair.yml",
      workflowSha: WORKFLOW_SHA,
      dispatchRef: "main",
    }),
    resolveActorCapabilities: async () => ({
      schemaVersion: 1 as const,
      actorIdentity: "maintainer-1",
      permissions: ["maintain" as const],
    }),
    ...overrides,
  };
}

describe("GitHub repair attestation context", () => {
  it("resolves exact live PR, policy, actor, workflow, and unchanged-authority identities without App state", async () => {
    const result = await resolveRepairAttestationContext({
      repositoryId: "100",
      pullRequestNumber: 7,
      actor: { login: "maintainer", expectedActorId: "maintainer-1" },
      runId: "9001",
      authorityPaths: [
        ".github/workflows/review-gate-repair.yml",
        "packages/arc-framework/src/scripts/review-gate/core/attestations.ts",
      ],
      policy: SELF_HOSTING_POLICY,
    }, api());

    expect(result).toMatchObject({
      requirement: {
        policyVersion: computePolicyVersion({ policy: SELF_HOSTING_POLICY }),
        changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD }),
        headSha: HEAD,
      },
      authenticatedActor: { actorIdentity: "maintainer-1", permissions: ["maintain"] },
      authorIdentity: "author-1",
      purpose: "repair-authority",
      repair: {
        repositoryId: "100",
        changeRequestOrdinal: 7,
        controllerExecutionId: "9001",
        controllerExecutionAttempt: 2,
        controllerDefinitionSha: WORKFLOW_SHA,
        authorityCodeUnchanged: true,
      },
    });
  });

  it.each([
    ["author", { resolveActorCapabilities: async () => ({
      schemaVersion: 1 as const, actorIdentity: "author-1", permissions: ["maintain" as const],
    }) }],
    ["weak actor", { resolveActorCapabilities: async () => ({
      schemaVersion: 1 as const, actorIdentity: "maintainer-1", permissions: ["read" as const],
    }) }],
    ["changed authority", { readPullRequest: async () => ({
      changeRequestId: "PR_node", headSha: HEAD, baseRef: "main", baseSha: "b".repeat(40), diffBaseSha: DIFF_BASE,
      authorIdentity: "author-1", changedPaths: [".github/workflows/review-gate-repair.yml"],
    }) }],
    ["non-default dispatch", { readWorkflowRun: async () => ({
      runId: "9001", runAttempt: 2, event: "workflow_dispatch" as const,
      workflowPath: ".github/workflows/review-gate-repair.yml", workflowSha: WORKFLOW_SHA, dispatchRef: "feature",
    }) }],
  ])("fails closed for %s repair context", async (_name, overrides) => {
    await expect(resolveRepairAttestationContext({
      repositoryId: "100",
      pullRequestNumber: 7,
      actor: { login: "maintainer", expectedActorId: "maintainer-1" },
      runId: "9001",
      authorityPaths: [".github/workflows/review-gate-repair.yml"],
      policy: SELF_HOSTING_POLICY,
    }, api(overrides))).rejects.toThrow();
  });
});
