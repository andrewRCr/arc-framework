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
import { BaseMergeInputSchema } from "../../../../src/scripts/base/merge.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const PLAN_ID = "123e4567-e89b-42d3-a456-426614174000";

function readyDelivery() {
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
  return {
    status: "ready" as const,
    claim: {
      status: "composed" as const,
      candidateId: digest("c"),
      endpoints,
      proof: { status: "accepted" as const, proof: "tree-equality" as const },
    },
    checks: { status: "ready" as const, candidateId: digest("c"), targets: [] },
    top: {
      status: "ready" as const,
      request: {
        binding: { providerId: "github", changeRequestId: "42" },
        repository: "owner/repo",
        headRef: "feat/example",
        headSha: oid("c"),
        baseRef: "main",
        state: "open" as const,
      },
    },
  };
}

const CLEAN_DRIFT = {
  mode: "authoritative" as const,
  verdict: "clean" as const,
  state: "local-ahead" as const,
  ahead: 3,
  behind: 0,
  base: "main",
  baseOid: oid("b"),
  headOid: oid("c"),
  movement: "disjoint" as const,
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
      headOid: oid("c"),
      movement: "overlapping",
      integrationEvidence: {
        coverage: "complete",
        scannedCommitCount: 1,
        events: [],
        unclassifiedCommitCount: 0,
        truncated: false,
        limitations: [],
      },
      overlap: { status: "available", substantivePaths: ["src/example.ts"], regenerablePaths: [] },
      register: { kind: "attention", text: "Base moved." },
    }),
    readMovementObservation: async () => ({
      feasibility: { state: "clean", base: oid("b"), head: oid("c") },
      admission: {
        state: "mergeable",
        repository: "owner/repo",
        changeRequest: 42,
        base: oid("b"),
        head: oid("c"),
      },
    }),
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
      convergenceScope: null,
    }),
    composeCandidateApplicabilityResolutionSelector: async () => {
      throw new Error("a current Candidate does not require an applicability selector");
    },
    readCandidatePublication: async () => ({ status: "current" as const }),
    readDeliveryTerminalRemedy: async () => null,
    composeDelivery: async () => ({ status: "not-applicable" }),
    readShippedDeliveryPublicationCommit: async () => ({ status: "none" }),
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
    createHandle: async () => ({
      status: "created",
      handle: `checkpoint-v1:${oid("c")}:${digest("e")}`,
    }),
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
    deps.readCandidate = async () => decision;
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

  it("returns a typed refusal when applicability selector composition fails", async () => {
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

    for (const drift of ["reconcile", "clean"] as const) {
      const deps = dependencies();
      if (drift === "clean") deps.readDrift = async () => CLEAN_DRIFT;
      deps.readCandidate = async () => decision;
      deps.composeCandidateApplicabilityResolutionSelector = async () => {
        throw new Error("The Candidate applicability decision is no longer current.");
      };

      await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
        .resolves.toMatchObject({
          state: "blocked",
          nextAction: "stop",
          reason: "composition-unavailable",
          payload: { detail: "The Candidate applicability decision is no longer current." },
        });
    }
  });

  it("returns a safe behind-base verdict with the validated facts", async () => {
    const deps = dependencies();
    const readCandidate = deps.readCandidate;
    deps.readCandidate = async (workUnit, baseRevision) => baseRevision === oid("b")
      ? readCandidate(workUnit, baseRevision)
      : null;

    const result = await checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps);
    expect(result).toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-base",
        reason: "base-reconcile-required",
        remedy: {
          argv: [
            "arc", "base", "merge",
            "--expected-base", oid("b"),
            "--expected-head", oid("c"),
            "--json",
          ],
        },
        payload: {
          drift: { verdict: "reconcile", baseOid: oid("b") },
          candidateHead: oid("c"),
          observation: {
            movement: "overlapping",
            integrationEvidenceComplete: true,
            feasibility: { state: "clean", base: oid("b"), head: oid("c") },
            admission: { state: "mergeable", base: oid("b"), head: oid("c") },
          },
        },
      });
    if (result.state !== "reconcile") throw new Error("expected base reconciliation");
    expect(BaseMergeInputSchema.parse({
      expectedBase: result.remedy.argv[4],
      expectedHead: result.remedy.argv[6],
    })).toEqual({ expectedBase: oid("b"), expectedHead: oid("c") });
  });

  it("continues directly to approval for disjoint exact-pair movement", async () => {
    const deps = dependencies();
    const readDrift = deps.readDrift;
    deps.readDrift = async (workUnit) => {
      const drift = await readDrift(workUnit);
      if (drift.verdict !== "clean" && drift.verdict !== "reconcile") {
        throw new Error("expected a healthy drift reading");
      }
      return {
        ...drift,
        movement: "disjoint",
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      };
    };
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "ready",
        nextAction: "request-approval",
        payload: {
          movementObservation: {
            movement: "disjoint",
            feasibility: { state: "clean", base: oid("b"), head: oid("c") },
            admission: { state: "mergeable", base: oid("b"), head: oid("c") },
          },
        },
      });
  });

  it("blocks when drift and merge observations name different heads", async () => {
    const deps = dependencies();
    deps.readDrift = async () => ({ ...CLEAN_DRIFT, headOid: oid("d") });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "unsafe-reconcile",
        detail: "Git feasibility belongs to a different head than the drift observation.",
        coordinates: { observedBaseOid: oid("b"), observedHeadOid: oid("d") },
        payload: {
          drift: { headOid: oid("d") },
          observation: { feasibility: { head: oid("c") }, admission: { head: oid("c") } },
        },
      });
  });

  it("returns the distinct regenerable reconcile continuation", async () => {
    const deps = dependencies();
    deps.readMovementObservation = async () => ({
      feasibility: {
        state: "regenerable-conflict", base: oid("b"), head: oid("c"), paths: ["ROADMAP.md"],
      },
      admission: {
        state: "mergeable", repository: "owner/repo", changeRequest: 42, base: oid("b"), head: oid("c"),
      },
    });
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-regenerable",
        reason: "regenerable-reconcile-required",
        remedy: {
          argv: [
            "arc", "base", "merge",
            "--expected-base", oid("b"),
            "--expected-head", oid("c"),
            "--regenerate-roadmap",
            "--json",
          ],
        },
        payload: { candidateHead: oid("c") },
      });
  });

  it("preserves unresolved host detail and one bounded retry remedy", async () => {
    const deps = dependencies();
    deps.readMovementObservation = async () => ({
      feasibility: { state: "clean", base: oid("b"), head: oid("c") },
      admission: {
        state: "unresolved",
        repository: "owner/repo",
        changeRequest: 42,
        base: oid("b"),
        head: oid("c"),
        detail: "Host is still computing exact admission.",
      },
    });
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "host-pending",
        payload: { detail: "Host is still computing exact admission." },
        remedy: { argv: ["arc", "integrate", "checkpoint", "example", "--json"] },
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
      evidence: { baseRevision: oid("b"), baselineRevision: oid("c"), mergeBase: oid("a") },
    });
    const readMovementObservation = deps.readMovementObservation;
    deps.readMovementObservation = async (workUnit, drift) => {
      events.push("host-read");
      return readMovementObservation(workUnit, drift);
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "reconcile",
        nextAction: "reconcile-base",
        payload: {
          drift: { verdict: "reconcile", baseOid: oid("b") },
          observation: { movement: "overlapping", feasibility: { state: "clean" } },
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
      evidence: { baseRevision: oid("b"), baselineRevision: oid("c"), mergeBase: oid("a") },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "unsafe-reconcile",
        payload: { observation: { movement: "overlapping" } },
      });
  });

  it("fails closed when delivery drift cannot be classified", async () => {
    const deps = dependencies();
    const events: string[] = [];
    deps.classifyDeliveryDrift = async () => ({
      status: "unavailable",
      detail: "The delivery predecessor coordinate is unavailable.",
      evidence: { baseRevision: oid("b"), baselineRevision: oid("c") },
      nextAction: { command: "rerun-checkpoint", workUnit: "example" },
    });
    deps.readMovementObservation = async () => {
      events.push("host-read");
      throw new Error("must not read movement observations");
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "delivery-terminal-blocked",
        payload: {
          reason: "drift-classification-unavailable",
          detail: "The delivery predecessor coordinate is unavailable.",
          driftEvidence: { baseRevision: oid("b"), baselineRevision: oid("c") },
          classifierAction: { command: "rerun-checkpoint", workUnit: "example" },
        },
      });
    expect(events).toEqual([]);
  });

  it("preserves terminal predecessor-overlap evidence and explanation", async () => {
    const deps = dependencies();
    deps.classifyDeliveryDrift = async () => ({
      status: "refused",
      reason: "predecessor-overlap",
      paths: ["src/shared.ts"],
      explanation: "Protected-base movement overlaps the retained delivery predecessor contribution.",
      evidence: {
        baseRevision: oid("b"),
        baselineRevision: oid("c"),
        mergeBase: oid("a"),
        substantivePaths: ["src/shared.ts"],
        regenerablePaths: [],
        residualPaths: [],
        predecessorPaths: ["src/shared.ts"],
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "delivery-terminal-blocked",
        payload: {
          reason: "predecessor-overlap",
          paths: ["src/shared.ts"],
          explanation: "Protected-base movement overlaps the retained delivery predecessor contribution.",
          driftEvidence: {
            baseRevision: oid("b"),
            baselineRevision: oid("c"),
            mergeBase: oid("a"),
            predecessorPaths: ["src/shared.ts"],
          },
        },
      });
  });

  it("blocks with exact paths when Git feasibility reports a substantive conflict", async () => {
    const deps = dependencies();
    deps.readMovementObservation = async () => ({
      feasibility: {
        state: "substantive-conflict", base: oid("b"), head: oid("c"), paths: ["src/conflict.ts"],
      },
      admission: {
        state: "mergeable", repository: "owner/repo", changeRequest: 42, base: oid("b"), head: oid("c"),
      },
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "conflict",
        payload: {
          paths: ["src/conflict.ts"],
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
      headOid: null,
      unavailableReason: "fetch-failed",
      detail: "The remote base could not be fetched.",
      coordinates: { base: "main", baseOid: null, headOid: null },
      continuation: {
        kind: "terminal-explanation",
        terminalExplanation: "Restore remote access before retrying the authoritative drift read.",
      },
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
        remedy: {
          invariant: "The checkpoint requires an authoritative base-drift read.",
          text: expect.stringContaining(
            "Resolve the reported authoritative drift failure, then re-run the checkpoint",
          ),
          argv: ["arc", "integrate", "checkpoint", "example", "--json"],
        },
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
      ...(baseRevision === oid("b")
        ? { status: "current" as const }
        : { status: "refresh-required" as const, kind: "singleton" as const }),
    });
    deps.readDrift = async () => ({
      mode: "authoritative",
      verdict: "clean",
      state: "local-ahead",
      ahead: 3,
      behind: 0,
      base: "main",
      baseOid: oid("b"),
      headOid: oid("c"),
      movement: "disjoint",
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

  it("returns a typed recompose result when the Candidate record moves before persistence", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.createHandle = async () => ({
      status: "recompose-required",
      expectedRecordVersion: digest("a"),
      observedRecordVersion: digest("b"),
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toEqual({
        schemaVersion: 1,
        mode: "integrate-checkpoint",
        workUnit: "example",
        state: "recompose-required",
        nextAction: "rerun-checkpoint",
        reason: "candidate-record-moved",
        detail: "The Candidate record changed before checkpoint persistence completed.",
        coordinates: { observedBaseOid: oid("b"), observedHeadOid: oid("c") },
        remedy: {
          invariant: "The ready composition binds the exact satisfied Candidate head.",
          text: "The ready composition binds the exact satisfied Candidate head. Resolve the reported composition "
            + "failure, then re-run: `arc integrate checkpoint example --json`.",
          argv: ["arc", "integrate", "checkpoint", "example", "--json"],
        },
        payload: {
          expectedRecordVersion: digest("a"),
          observedRecordVersion: digest("b"),
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
          argv: ["arc", "delivery", "top-remedy", "-"],
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

  it.each([
    ["retarget", "pending host admission"],
    ["reopen-and-retarget", "closed terminal request"],
  ] as const)("returns %s before %s blocks checkpointing", async (action, condition) => {
    const deps = dependencies();
    const events: string[] = [];
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readMovementObservation = condition === "closed terminal request"
      ? async () => {
          events.push("host-admission");
          throw new Error("The terminal request is closed.");
        }
      : async () => {
          events.push("host-admission");
          return {
            feasibility: { state: "clean", base: oid("b"), head: oid("c") },
            admission: {
              state: "unresolved", repository: "owner/repo", changeRequest: 42,
              base: oid("b"), head: oid("c"), detail: "Host admission is pending.",
            },
          };
        };
    deps.readDeliveryTerminalRemedy = async () => {
      events.push("terminal-target");
      return {
        status: "blocked",
        nextAction: action,
        reason: "top-target-mismatch",
        planId: PLAN_ID,
        remedy: {
          nextAction: action,
          repository: "owner/repo",
          changeRequestId: "42",
          protectedBaseRef: "main",
        },
      };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: action,
        reason: "delivery-terminal-blocked",
        remedy: {
          argv: ["arc", "delivery", "top-remedy", "-"],
          stdin: { planId: PLAN_ID, action, repository: "owner/repo", protectedBaseRef: "main" },
        },
      });
    expect(events).toEqual(["terminal-target"]);
  });

  it("reobserves delivery after host admission before composing readiness", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const events: string[] = [];
    deps.readDeliveryTerminalRemedy = async () => {
      events.push("terminal-target");
      return null;
    };
    const readMovementObservation = deps.readMovementObservation;
    deps.readMovementObservation = async (workUnit, drift) => {
      events.push("host-admission");
      return readMovementObservation(workUnit, drift);
    };
    let deliveryReads = 0;
    deps.composeDelivery = async () => {
      events.push("full-delivery");
      deliveryReads += 1;
      return {
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
      };
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({ state: "blocked", nextAction: "retarget" });
    expect(deliveryReads).toBe(1);
    expect(events).toEqual(["terminal-target", "host-admission", "full-delivery"]);
  });

  it("stops when a delivery terminal result lacks coordinates for its retarget remedy", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.composeDelivery = async () => ({
      status: "blocked",
      nextAction: "retarget",
      reason: "top-target-mismatch",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "delivery-terminal-blocked",
        remedy: {
          argv: ["arc", "integrate", "checkpoint", "example", "--json"],
        },
        payload: {
          nextAction: "retarget",
          reason: "top-target-mismatch",
        },
      });
  });

  it("returns the exact existing delivery reconcile input for a stale terminal binding", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.composeDelivery = async () => ({
      status: "terminal-rebind-required",
      nextAction: "reconcile-delivery-state",
      planId: PLAN_ID,
      repository: "owner/repo",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "terminal-rebind-required",
        nextAction: "reconcile-delivery-state",
        reason: "delivery-terminal-rebind-required",
        remedy: {
          argv: ["arc", "delivery", "reconcile", "-"],
          stdin: { planId: PLAN_ID, repository: "owner/repo" },
        },
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
      kind: "singleton",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-required",
        nextAction: "resume-pre-publication",
        reason: "candidate-publication-stale",
        payload: {
          attestArgv: ["arc", "attest", "example", "--json"],
        },
      });
  });

  it("uses archived-record attestation for a stale shipped singleton boundary", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "with-integration",
      state: "shipped",
      position: { phase: "Shipped", location: "completed" },
      artifactFacts: [],
      complete: true,
    });
    deps.readCandidatePublication = async () => ({
      status: "refresh-required",
      kind: "singleton",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-required",
        nextAction: "resume-pre-publication",
        payload: {
          attestArgv: ["arc", "attest", "example", "--new-root", "--json"],
        },
      });
  });

  it("uses the archived-record attestation entry when a shipped Candidate boundary is stale", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "with-integration",
      state: "shipped",
      position: { phase: "Shipped", location: "completed" },
      artifactFacts: [],
      complete: true,
    });
    deps.readCandidatePublication = async () => ({
      status: "refresh-required",
      kind: "delivery",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-required",
        nextAction: "refresh-shipped-delivery",
        payload: {
          attestArgv: ["arc", "attest", "example", "--new-root", "--json"],
        },
      });
  });

  it("returns the exact staged shipped delivery boundary for commit before ready composition", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "with-integration",
      state: "shipped",
      position: { phase: "Shipped", location: "completed" },
      artifactFacts: [],
      complete: true,
    });
    deps.composeDelivery = async () => readyDelivery();
    deps.readShippedDeliveryPublicationCommit = async () => ({
      status: "commit-required",
      boundaryPath: ".arc/system/.internal/candidates/example.boundary.json",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-commit-required",
        nextAction: "commit-boundary",
        reason: "candidate-publication-boundary-staged",
        detail: "The shipped delivery publication boundary is staged and requires a commit before checkpointing.",
        coordinates: { observedBaseOid: oid("b"), observedHeadOid: oid("c") },
        continuation: {
          kind: "terminal-explanation",
          terminalExplanation: expect.stringContaining("exact staged"),
        },
        payload: {
          boundaryPath: ".arc/system/.internal/candidates/example.boundary.json",
        },
      });
  });

  it("refreshes the staged shipped delivery boundary after terminal state movement", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "with-integration",
      state: "shipped",
      position: { phase: "Shipped", location: "completed" },
      artifactFacts: [],
      complete: true,
    });
    deps.composeDelivery = async () => readyDelivery();
    deps.readShippedDeliveryPublicationCommit = async () => ({ status: "refresh-required" });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "candidate-publication-required",
        nextAction: "refresh-shipped-delivery",
        payload: {
          attestArgv: ["arc", "attest", "example", "--new-root", "--json"],
        },
      });
  });

  it("refuses unrelated dirt while recognizing a shipped delivery publication boundary", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readLifecycle = async () => ({
      workUnit: "example",
      storageVersion: oid("c"),
      archiveCadence: "with-integration",
      state: "shipped",
      position: { phase: "Shipped", location: "completed" },
      artifactFacts: [],
      complete: true,
    });
    deps.composeDelivery = async () => readyDelivery();
    deps.readShippedDeliveryPublicationCommit = async () => ({
      status: "blocked",
      detail: "The worktree contains changes beyond the exact staged publication boundary.",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "composition-unavailable",
        payload: {
          detail: "The worktree contains changes beyond the exact staged publication boundary.",
        },
      });
  });

  it("returns a typed composition refusal when the Candidate publication read fails", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    deps.readCandidatePublication = async () => {
      throw new Error("publication state unavailable");
    };

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        nextAction: "stop",
        reason: "composition-unavailable",
        payload: { detail: "publication state unavailable" },
      });
  });

  it("keeps the integration interlock after the delivery terminal checks pass", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const settlementBases: string[] = [];
    deps.composeSettlementPlan = async ({ baseRevision }) => {
      settlementBases.push(baseRevision);
      return composeCanonicalSettlementPlan([]);
    };
    deps.composeDelivery = async ({ baseRevision }) => baseRevision === CLEAN_DRIFT.baseOid ? readyDelivery() : ({
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
    expect(settlementBases).toEqual([CLEAN_DRIFT.baseOid]);
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
      headOid: oid("c"),
      movement: "disjoint",
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
      convergenceScope: "full",
    });

    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "candidate-convergence-pending",
        nextAction: "run-convergence-verification",
        action: {
          kind: "run-convergence-verification",
          requiredScope: "full",
          verificationEvidenceRefRequired: true,
          attestArgv: [
            "arc", "attest", "example", "--scope", "full",
            "--verification-evidence-ref", "{verificationEvidenceRef}", "--json",
          ],
        },
        payload: {
          candidate: {
            implementationChanged: true,
            convergenceVerification: "pending",
            convergenceScope: "full",
          },
        },
      });
  });

  it("refuses a ready change request that differs from the host-admission request", async () => {
    const deps = dependencies();
    deps.readDrift = async () => CLEAN_DRIFT;
    const composeReady = deps.composeReady;
    deps.composeReady = async (input) => {
      const ready = await composeReady(input);
      return {
        ...ready,
        statusSummary: {
          ...ready.statusSummary,
          changeRequest: { ...ready.statusSummary.changeRequest, pullRequest: 43 },
        },
      };
    };
    await expect(checkpointIntegration({ schemaVersion: 1, workUnit: "example" }, deps))
      .resolves.toMatchObject({
        state: "blocked",
        reason: "composition-unavailable",
        payload: { detail: "ready composition does not bind the exact approved request and Candidate head" },
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
        remedy: { argv: ["arc", "review", "pre-publication", "example"] },
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
