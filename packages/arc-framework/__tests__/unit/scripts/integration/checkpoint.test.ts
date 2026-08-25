/** Integration checkpoint verdict behavior. */

import { describe, expect, it } from "vitest";

import {
  checkpointIntegration,
  type IntegrationCheckpointDependencies,
} from "../../../../src/scripts/integration/checkpoint.js";
import { canonicalDigest } from "../../../../src/lib/canonical/canonical-json.js";
import { classifyCandidateApplicability } from "../../../../src/lib/work-unit/candidate-applicability.js";
import { createCandidateSubjectSnapshot } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const PLAN_ID = "123e4567-e89b-42d3-a456-426614174000";

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
    composeCandidateApplicabilityResolutionSelector: async () => {
      throw new Error("a current Candidate does not require an applicability selector");
    },
    readCandidatePublication: async () => ({ status: "current" as const }),
    composeDelivery: async () => ({ status: "not-applicable" }),
    resolveMergeMethod: async (_repository, stackPosition) => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: "owner/repo",
      stackPosition,
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
  it("returns the exact bounded Candidate applicability decision for authority selection", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const subject = (source: string) => createCandidateSubjectSnapshot([{
      path: "src/example.ts",
      mode: "100644",
      digest: canonicalDigest({ source }),
      treatment: "reviewable",
    }]);
    const request = {
      candidateId: digest("c"),
      baselineTarget: { revision: oid("a"), subject: subject("prior") },
      currentTarget: { revision: oid("c"), subject: subject("current") },
      currentBase: oid("b"),
    };
    const decision = classifyCandidateApplicability(request, {
      endpoints: {
        before: {
          predecessor: { head: oid("1"), tree: oid("2") },
          member: { head: oid("a"), tree: oid("3") },
        },
        after: {
          predecessor: { head: oid("b"), tree: oid("4") },
          member: { head: oid("c"), tree: oid("5") },
        },
      },
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
    });
    if (decision.state !== "decision-required") throw new Error("expected a bounded applicability decision");
    deps.readCandidate = async () => decision as never;
    const resolutionSelector = {
      schemaVersion: 1 as const,
      expectedRecordVersion: digest("f"),
      candidateId: request.candidateId,
      priorTarget: request.baselineTarget,
      currentTarget: request.currentTarget,
      currentBase: request.currentBase,
      projectionDigest: decision.projectionDigest,
      residualDigest: decision.residualDigest,
    };
    deps.composeCandidateApplicabilityResolutionSelector = async () => resolutionSelector;

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-applicability",
        nextAction: "request-authority",
        payload: {
          state: "decision-required",
          projectionDigest: decision.projectionDigest,
          residualDigest: decision.residualDigest,
          selectionOfferText: decision.selectionOfferText,
          recommendedActionText: decision.recommendedActionText,
          selectionPromptText: decision.selectionPromptText,
          resolutionSelector,
        },
      });
  });

  it("returns a safe behind-base verdict with the validated facts", async () => {
    const deps = dependencies();
    const readCandidate = deps.readCandidate;
    deps.readCandidate = async (workUnit, baseRevision) => baseRevision === oid("b")
      ? readCandidate(workUnit, baseRevision)
      : null;

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-base",
        payload: {
          drift: { verdict: "reconcile", baseOid: oid("b") },
          candidateHead: oid("c"),
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

  it("routes classified terminal residual drift through the guarded base reconcile", async () => {
    const deps = dependencies();
    const events: string[] = [];
    const readDrift = deps.readDrift;
    deps.readDrift = async (workUnit) => ({
      ...await readDrift(workUnit),
      overlap: {
        status: "available",
        substantivePaths: ["terminal.ts"],
        regenerablePaths: [],
      },
    });
    deps.classifyDeliveryDrift = async () => ({
      status: "reconcile",
      nextAction: "reconcile-base",
      safetyClass: "residual-contained",
    });
    deps.readReconcileHost = async () => {
      events.push("host-read");
      return { state: "mergeable" };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-base",
        payload: {
          drift: { verdict: "reconcile", baseOid: oid("b") },
          safety: { safe: true, baseOid: oid("b"), substantivePaths: ["terminal.ts"] },
        },
      });
    expect(events).toEqual(["host-read"]);
  });

  it("keeps substantive paths outside the terminal residual unsafe", async () => {
    const deps = dependencies();
    const readDrift = deps.readDrift;
    deps.readDrift = async (workUnit) => ({
      ...await readDrift(workUnit),
      overlap: {
        status: "available",
        substantivePaths: ["union-only.ts"],
        regenerablePaths: [],
      },
    });
    deps.classifyDeliveryDrift = async () => ({
      status: "reconcile",
      nextAction: "reconcile-base",
      safetyClass: "generic",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "unsafe-reconcile",
        payload: { safety: { safe: false, substantivePaths: ["union-only.ts"] } },
      });
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
    const readCandidate = deps.readCandidate;
    deps.readCandidate = async (workUnit, baseRevision) => baseRevision === oid("b")
      ? readCandidate(workUnit, baseRevision)
      : null;
    deps.readCandidatePublication = async (_workUnit, baseRevision) => ({
      status: baseRevision === oid("b") ? "current" as const : "refresh-required" as const,
    });
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
            stackPosition: "non-delivery",
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
    deps.resolveMergeMethod = async (repository, stackPosition) => {
      expect(repository).toBe("owner/repo");
      return {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "other/repo",
        stackPosition,
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
      planId: PLAN_ID,
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
        remedy: {
          argv: ["arc", "delivery", "top-remedy", "-", "--json"],
          stdin: {
            planId: PLAN_ID,
            action: "retarget",
            repository: "owner/repo",
            protectedBaseRef: "main",
          },
        },
        payload: {
          reason: "top-target-mismatch",
          planId: PLAN_ID,
          remedy: { nextAction: "retarget" },
        },
      });
    expect(events).toEqual([]);
  });

  it("returns the exact existing delivery reconcile input for a stale terminal binding", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.composeDelivery = async () => ({
      status: "terminal-rebind-required",
      nextAction: "reconcile-delivery-state",
      planId: PLAN_ID,
      repository: "owner/repo",
    }) as never;

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "terminal-rebind-required",
        nextAction: "reconcile-delivery-state",
        payload: {
          reconcileInput: { planId: PLAN_ID, repository: "owner/repo" },
        },
      });
  });

  it("returns the ordinary pre-publication entry when the recognized Candidate boundary is stale", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readCandidatePublication = async () => ({
      status: "refresh-required",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-required",
        nextAction: "resume-pre-publication",
        payload: {
          attestArgv: ["arc", "attest", "example", "--json"],
        },
      });
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
    deps.composeDelivery = async ({ baseRevision }) => baseRevision === CLEAN_DRIFT.baseOid ? ({
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
    }) : ({
      status: "blocked",
      nextAction: "retarget",
      reason: "top-target-mismatch",
      planId: PLAN_ID,
      remedy: {
        nextAction: "retarget",
        repository: "owner/repo",
        changeRequestId: "42",
        protectedBaseRef: "main",
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "ready",
        nextAction: "request-approval",
        payload: { mergeMethod: { stackPosition: "top" } },
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
