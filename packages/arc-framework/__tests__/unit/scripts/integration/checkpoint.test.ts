/** Integration checkpoint verdict behavior. */

import { describe, expect, it } from "vitest";

import {
  checkpointIntegration,
  type IntegrationCheckpointDependencies,
} from "../../../../src/scripts/integration/checkpoint.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

function dependencies(): IntegrationCheckpointDependencies {
  return {
    readDrift: async () => ({
      mode: "authoritative",
      verdict: "reconcile",
      state: "diverged",
      ahead: 2,
      behind: 1,
      base: "main",
      baseOid: oid("b"),
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: ["ROADMAP.md"] },
      register: { kind: "attention", text: "Base moved." },
    }),
    readReconcileHost: async () => ({ state: "mergeable" }),
    readLifecycle: async () => ({
      workUnit: "example",
      archiveCadence: "manual",
      state: "integrating",
      position: { phase: "Integrating", location: "active" },
      complete: true,
    }),
    readCandidate: async () => ({
      status: "current",
      candidateId: digest("c"),
      recognizedRevision: oid("c"),
      implementationChanged: false,
      convergenceVerification: "satisfied",
    }),
    resolveMergeMethod: async () => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: "owner/repo",
      state: "validated",
      nextAction: "use-method",
      method: "merge",
      allowedMethods: ["merge"],
      policyFingerprint: digest("d"),
    }),
    composeReady: async ({ lifecycle }) => ({
      approvedHead: oid("c"),
      candidateTailDiff: {
        fromRevision: oid("a"),
        throughRevision: oid("c"),
        reference: `${oid("a")}..${oid("c")}`,
      },
      requirementSummary: { conclusion: "satisfied", requirements: [] },
      statusSummary: {
        lifecycle,
        changeRequest: {
          repository: "owner/repo",
          pullRequest: 42,
          headRef: "feat/example",
          headSha: oid("c"),
          state: "open",
        },
        requiredChecks: "green",
      },
      reviewRecord: { markdown: null, dispositionIds: [] },
    }),
    createHandle: async () => "checkpoint:test",
  };
}

describe("integration checkpoint", () => {
  it("returns a safe behind-base verdict with the validated facts", async () => {
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, dependencies()))
      .resolves.toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-base",
        payload: {
          drift: { verdict: "reconcile", baseOid: oid("b") },
          safety: {
            baseOid: oid("b"),
            integrationEvidenceComplete: true,
            overlapAvailable: true,
            substantivePaths: [],
            regenerablePaths: ["ROADMAP.md"],
            host: { state: "mergeable" },
            safe: true,
          },
        },
      });
  });

  it("blocks with the unavailable drift payload", async () => {
    const deps = dependencies();
    deps.readDrift = async () => ({
      mode: "authoritative",
      verdict: "unavailable",
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      base: "main",
      baseOid: null,
      unavailableReason: "fetch-failed",
      integrationEvidence: null,
      overlap: null,
      register: { kind: "degraded", text: "Remote unavailable." },
      failureReason: "error",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "drift-unavailable",
        payload: {
          drift: { verdict: "unavailable", unavailableReason: "fetch-failed" },
        },
      });
  });

  it("returns the complete approval composition when every prerequisite is ready", async () => {
    const deps = dependencies();
    deps.readDrift = async () => ({
      mode: "authoritative",
      verdict: "clean",
      state: "local-ahead",
      ahead: 3,
      behind: 0,
      base: "main",
      baseOid: oid("b"),
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 0,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "ready",
        nextAction: "request-approval",
        payload: {
          approvedHead: oid("c"),
          checkpointHandle: "checkpoint:test",
          candidateTailDiff: { fromRevision: oid("a"), throughRevision: oid("c") },
          requirementSummary: { conclusion: "satisfied" },
          statusSummary: {
            lifecycle: { state: "integrating", complete: true },
            requiredChecks: "green",
          },
          mergeMethod: {
            state: "validated",
            method: "merge",
            policyFingerprint: digest("d"),
          },
          reviewRecord: { markdown: null, dispositionIds: [] },
        },
      });
  });

  it("blocks an implementation-changing lineage without its converged full attestation", async () => {
    const deps = dependencies();
    deps.readDrift = async () => ({
      mode: "authoritative",
      verdict: "clean",
      state: "local-ahead",
      ahead: 1,
      behind: 0,
      base: "main",
      baseOid: oid("b"),
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 0,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      register: null,
    });
    deps.readCandidate = async () => ({
      status: "current",
      candidateId: digest("c"),
      recognizedRevision: oid("c"),
      implementationChanged: true,
      convergenceVerification: "pending",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "candidate-convergence-pending",
        payload: {
          candidate: {
            implementationChanged: true,
            convergenceVerification: "pending",
          },
        },
      });
  });
});
