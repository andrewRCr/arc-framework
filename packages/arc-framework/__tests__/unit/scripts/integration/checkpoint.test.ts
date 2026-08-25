/** Integration checkpoint verdict behavior. */

import { describe, expect, it } from "vitest";

import {
  checkpointIntegration,
  type IntegrationCheckpointDependencies,
} from "../../../../src/scripts/integration/checkpoint.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

const CLEAN_DRIFT = {
  mode: "authoritative" as const,
  verdict: "clean" as const,
  state: "local-ahead" as const,
  ahead: 3,
  behind: 0,
  base: "main",
  baseOid: oid("b"),
  integrationEvidence: {
    coverage: "complete" as const,
    scannedCommitCount: 0,
    events: [],
    unclassifiedCommitCount: 0,
    truncated: false,
    limitations: [],
  },
  overlap: { status: "available" as const, substantivePaths: [], regenerablePaths: [] },
  register: null,
};

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
    classifyDeliveryDrift: async () => ({ status: "not-applicable" }),
    readLifecycle: async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "manual",
      state: "integrating",
      position: { phase: "Integrating", location: "active" },
      artifactFacts: [],
      complete: true,
    }),
    readCandidate: async () => ({
      status: "current",
      candidateId: digest("c"),
      recognizedRevision: oid("c"),
      implementationChanged: false,
      convergenceVerification: "satisfied",
    }),
    composeDelivery: async () => ({ status: "not-applicable" }),
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
          baseRef: "main",
          headRef: "feat/example",
          headSha: oid("c"),
          state: "open",
        },
        requiredChecks: "green",
      },
    }),
    composeSettlementPlan: async () => composeCanonicalSettlementPlan([]),
    createHandle: async () => `checkpoint-v1:${oid("c")}:${digest("e")}`,
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

  it("routes residual drift through terminal-member verification before base reconcile", async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.classifyDeliveryDrift = async () => ({
      status: "verify-member",
      nextAction: "verify-terminal-member",
      deliverableId: digest("d"),
      paths: ["packages/arc-framework/src/terminal.ts"],
    });
    deps.readReconcileHost = async () => {
      events.push("host-read");
      return { state: "mergeable" };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "verify-terminal-member",
        reason: "delivery-terminal-blocked",
        payload: {
          reason: "residual-overlap",
          deliverableId: digest("d"),
          paths: ["packages/arc-framework/src/terminal.ts"],
        },
      });
    expect(events).toEqual([]);
  });

  it("fails closed when delivery drift cannot be classified", async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.classifyDeliveryDrift = async () => ({
      status: "unavailable",
      detail: "The delivery predecessor coordinate is unavailable.",
    });
    deps.readReconcileHost = async () => {
      events.push("host-read");
      return { state: "mergeable" };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "delivery-terminal-blocked",
        payload: {
          reason: "drift-classification-unavailable",
          detail: "The delivery predecessor coordinate is unavailable.",
        },
      });
    expect(events).toEqual([]);
  });

  it("blocks as an unsafe reconcile when the host says the merge conflicts", async () => {
    // The analyzer half is clean and the only drifted path is regenerable; host mergeability is
    // still the whole host signal, because a conflict report names no paths to weigh against it.
    const deps = dependencies();
    deps.readReconcileHost = async () => ({ state: "conflicting" });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "unsafe-reconcile",
        payload: {
          safety: {
            substantivePaths: [],
            regenerablePaths: ["ROADMAP.md"],
            host: { state: "conflicting" },
            safe: false,
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

  it("blocks a work unit whose meta still owes its lifecycle artifacts", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "manual",
      state: "integrating",
      position: { phase: "Integrating", location: "active" },
      artifactFacts: [{
        code: "missing-completion-notes",
        path: ".arc/active/meta-example.md",
        message: "Completion Notes are required.",
      }],
      complete: false,
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "lifecycle-incomplete",
        payload: {
          lifecycle: {
            state: "integrating",
            artifactFacts: [{ code: "missing-completion-notes" }],
          },
        },
      });
  });

  it("refuses a lifecycle summary that calls itself complete while owing artifacts", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "manual",
      state: "integrating",
      position: { phase: "Integrating", location: "active" },
      artifactFacts: [{
        code: "missing-completion-notes",
        path: ".arc/active/meta-example.md",
        message: "Completion Notes are required.",
      }],
      complete: true,
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .rejects.toThrow();
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
          checkpointHandle: `checkpoint-v1:${oid("c")}:${digest("e")}`,
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
          interlockSurface: {
            machineEvidence: {
              state: "clean",
              text: expect.stringContaining("Machine evidence: 9 checks clean."),
            },
            extensionReport: { label: "Extension report", content: null },
          },
        },
      });
  });

  it("blocks merge-method policy resolved for a different repository", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.resolveMergeMethod = async (repository) => {
      expect(repository).toBe("owner/repo");
      return {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "other/repo",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: digest("d"),
      };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "merge-method-blocked",
      });
  });

  it("publishes a delivery terminal remedy without composing merge readiness", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const events: string[] = [];
    deps.composeDelivery = async () => ({
      status: "blocked",
      nextAction: "retarget",
      reason: "top-target-mismatch",
      remedy: {
        nextAction: "retarget",
        repository: "owner/repo",
        changeRequestId: "42",
        protectedBaseRef: "main",
      },
    });
    deps.composeReady = async (input) => {
      events.push(`ready:${input.delivery.status}`);
      throw new Error("must not compose merge readiness");
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "retarget",
        reason: "delivery-terminal-blocked",
        payload: { reason: "top-target-mismatch", remedy: { nextAction: "retarget" } },
      });
    expect(events).toEqual([]);
  });

  it("keeps the integration interlock after the delivery terminal checks pass", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const endpoints = {
      before: {
        predecessor: { head: oid("a"), tree: oid("b") },
        member: { head: oid("c"), tree: oid("d") },
      },
      after: {
        predecessor: { head: oid("a"), tree: oid("b") },
        member: { head: oid("c"), tree: oid("d") },
      },
    };
    deps.composeDelivery = async () => ({
      status: "ready",
      claim: {
        status: "composed",
        candidateId: digest("c"),
        endpoints,
        proof: { status: "accepted", proof: "tree-equality" },
      },
      checks: { status: "ready", candidateId: digest("c"), targets: [] },
      top: {
        status: "ready",
        request: {
          binding: { providerId: "github", changeRequestId: "42" },
          repository: "owner/repo",
          headRef: "feat/example",
          headSha: oid("c"),
          baseRef: "main",
          state: "open",
        },
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({ state: "ready", nextAction: "request-approval" });
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

  it("blocks a reserved hosted review that has produced no verdict, naming its corrective command", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const composeReady = deps.composeReady;
    deps.composeReady = async (input) => ({
      ...await composeReady(input),
      requirementSummary: {
        conclusion: "pending",
        requirements: [{
          id: "hosted-review-reservation",
          state: "pending",
          detail: "The reserved hosted source `coderabbit-pr` has produced no verdict-bearing review.",
        }],
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "hosted-reservation-pending",
        remedy: { argv: ["arc", "review", "pre-publication", "example", "--json"] },
        payload: {
          requirement: { id: "hosted-review-reservation", state: "pending" },
        },
      });
  });

  it("renders the Requirements signal from the composed summary rather than a clean literal", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const composeReady = deps.composeReady;
    deps.composeReady = async (input) => ({
      ...await composeReady(input),
      requirementSummary: {
        conclusion: "satisfied",
        requirements: [{
          id: "candidate-convergence",
          state: "pending",
          detail: "Convergence evidence is still being collected.",
        }],
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "ready",
        payload: {
          interlockSurface: {
            machineEvidence: {
              state: "exceptions",
              text: expect.stringContaining("Convergence evidence is still being collected."),
            },
          },
        },
      });
  });
});
