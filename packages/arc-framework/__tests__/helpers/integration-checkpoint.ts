/** Shared operational fixture for singleton integration checkpoint verdicts. */

import type { IntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { composeCanonicalSettlementPlan } from "../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

export function checkpointDependencies(): IntegrationCheckpointDependencies {
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
        baseRef: "main",
        base: oid("b"),
        head: oid("c"),
      },
    }),
    classifyDeliveryDrift: async () => ({ status: "not-applicable" }),
    readLifecycle: async () => ({
      workUnit: SlugSchema.parse("example"),
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
