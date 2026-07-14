import { describe, expect, it } from "vitest";

import type { RepairAttestationResolution } from "../../../../../src/scripts/review-gate/hosts/github/repair-context.js";
import {
  parseRepairDispatchEvent,
  validateRepairDispatch,
} from "../../../../../src/scripts/review-gate/runtime/repair-main.js";
import { computeChangeSetId } from "../../../../../src/scripts/review-gate/core/identity.js";

const HEAD = "c".repeat(40);
const DIFF_BASE = "d".repeat(40);
const WORKFLOW_SHA = "e".repeat(40);

const context: RepairAttestationResolution = {
  requirement: {
    schemaVersion: 1,
    id: "analysis",
    kind: "independent-analysis",
    obligation: "required",
    acceptableSources: [{ sourceKind: "agent", qualifier: "independent-analysis/v1" }],
    count: 1,
    initialAdmission: "automatic",
    policyVersion: "a".repeat(64),
    rubricVersion: "independent-analysis/v1",
    reasons: ["code-surface"],
    changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD }),
    headSha: HEAD,
  },
  authenticatedActor: { schemaVersion: 1, actorIdentity: "maintainer-1", permissions: ["maintain"] },
  acceptedReviewerClaims: ["codex-cli"],
  acceptedRuntimeKinds: { "codex-cli": "codex" },
  authorIdentity: "author-1",
  maxRunAgeMinutes: 60,
  purpose: "repair-authority",
  repair: {
    repositoryId: "100",
    changeRequestOrdinal: 7,
    controllerExecutionId: "9001",
    controllerExecutionAttempt: 1,
    controllerDefinitionRef: ".github/workflows/review-gate-repair.yml",
    controllerDefinitionSha: WORKFLOW_SHA,
    authorityCodeUnchanged: true,
  },
};

function manifest(): string {
  return JSON.stringify({
    schemaVersion: 1,
    purpose: "repair-authority",
    repositoryIdentity: "100",
    changeRequestOrdinal: 7,
    authorIdentity: "author-1",
    controllerExecution: {
      id: "9001", attempt: 1, definitionRef: context.repair.controllerDefinitionRef, definitionSha: WORKFLOW_SHA,
    },
    sourceKind: "agent",
    sourceIdentity: "codex-cli",
    reviewerClaim: "codex-cli",
    reviewRunId: "repair-review-1",
    reviewerRuntime: { kind: "codex", version: "1" },
    requirementId: "analysis",
    result: "clean",
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    headSha: HEAD,
    changeSetId: context.requirement.changeSetId,
    policyVersion: context.requirement.policyVersion,
    rubricVersion: context.requirement.rubricVersion,
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    evidenceUrlOrId: "https://example.test/repair-review-1",
    startedAt: "2026-07-12T20:00:00.000Z",
    completedAt: "2026-07-12T20:10:00.000Z",
    findings: [],
    closures: [],
  });
}

describe("repair validation output", () => {
  it("accepts only the typed repository-dispatch payload", () => {
    const event = {
      action: "review-gate-repair",
      repository: { id: 100 },
      sender: { id: 200, login: "maintainer" },
      client_payload: { pull_request: 7, payload: manifest() },
    };
    expect(parseRepairDispatchEvent(event)).toMatchObject({
      repositoryId: "100", pullRequestNumber: 7, actorId: "200", actorLogin: "maintainer",
    });
    expect(() => parseRepairDispatchEvent({ ...event, action: "other" })).toThrow(/invalid repair event/u);
  });

  it("emits one bounded qualified result only after context, graph, and environment proof", async () => {
    await expect(validateRepairDispatch({
      manifest: manifest(),
      selectedRef: "main",
      defaultBranch: "main",
    }, {
      resolveContext: async () => context,
      usedRunIds: [],
      auditGraph: async () => ({ ok: true, errors: [], writer: {
        workflowPath: context.repair.controllerDefinitionRef, jobId: "write-status",
      } }),
      verifyEnvironment: async () => [],
      now: new Date("2026-07-12T20:15:00.000Z"),
    })).resolves.toMatchObject({
      status: "qualified",
      repositoryId: "100",
      pullRequestNumber: 7,
      headSha: HEAD,
      workflowSha: WORKFLOW_SHA,
      validationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
  });

  it("binds controller execution fields that cannot be known before dispatch", async () => {
    const omitted = new Set(["purpose", "repositoryIdentity", "changeRequestOrdinal", "authorIdentity", "controllerExecution"]);
    const unbound = Object.fromEntries(
      Object.entries(JSON.parse(manifest()) as Record<string, unknown>).filter(([key]) => !omitted.has(key)),
    );
    await expect(validateRepairDispatch({
      manifest: JSON.stringify(unbound),
      selectedRef: "main",
      defaultBranch: "main",
    }, {
      resolveContext: async () => context,
      usedRunIds: [],
      auditGraph: async () => ({ ok: true, errors: [], writer: {
        workflowPath: context.repair.controllerDefinitionRef, jobId: "write-status",
      } }),
      verifyEnvironment: async () => [],
      now: new Date("2026-07-12T20:15:00.000Z"),
    })).resolves.toMatchObject({ status: "qualified", runId: "9001" });
  });

  it.each([
    ["non-default ref", { selectedRef: "feature" }, []],
    ["graph", {}, ["repair-writer-count:0"]],
    ["environment", {}, ["repair-environment-missing"]],
  ])("refuses %s dispatch", async (_name, overrides, errors) => {
    await expect(validateRepairDispatch({ manifest: manifest(), selectedRef: "main", defaultBranch: "main", ...overrides }, {
      resolveContext: async () => context,
      usedRunIds: [],
      auditGraph: async () => errors[0]?.startsWith("repair-writer")
        ? { ok: false, errors, writer: null }
        : { ok: true, errors: [], writer: { workflowPath: context.repair.controllerDefinitionRef, jobId: "write-status" } },
      verifyEnvironment: async () => errors[0]?.startsWith("repair-environment") ? errors : [],
      now: new Date("2026-07-12T20:15:00.000Z"),
    })).rejects.toThrow();
  });
});
