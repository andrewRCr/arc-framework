import { describe, expect, it } from "vitest";

import { canonicalize } from "../../../src/lib/canonical/canonical-json.js";
import {
  mergeProjectReadinessRecords,
  type ProjectReadinessAcceptedCandidate,
  type ProjectReadinessCompositionResult,
  type ProjectReadinessRecordCandidate,
} from "../../../src/lib/status/project-view.js";
import {
  validateV3DecomposeContinuation,
} from "../../../src/lib/work-unit/decompose-continuation.js";
import type { DecomposeReadinessDeps } from "../../../src/lib/work-unit/decompose-launch-readiness.js";
import {
  parseV3DecomposePreparation,
  v3CandidatePublication,
  v3PlanId,
  v3PreparationId,
  type V3DecomposePreparation,
} from "../../../src/lib/work-unit/decompose-v3-preparation.js";
import { v3CutMapDigest } from "../../../src/lib/work-unit/decompose-v3-schema.js";
import { v3DecompositionEvidenceFixture } from "../../fixtures/decompose-v3.js";

function candidate(
  slug: string,
  fields: Partial<ProjectReadinessRecordCandidate> = {},
): ProjectReadinessAcceptedCandidate {
  const path = `.arc/backlog/planned/origin/${slug}/meta-${slug}.md`;
  const record = mergeProjectReadinessRecords([{
    slug,
    location: "planned",
    state: "Planning",
    priority: "P3",
    dependsOn: [],
    source: { kind: "backlog-stub", location: "planned", path },
    ...fields,
  }])[0];
  if (record === undefined) throw new Error("candidate fixture requires one record");
  return { slug, path, lifecycleLocation: "planned", record };
}

function composition(
  acceptedCandidates = [candidate("member-a"), candidate("member-b")],
): ProjectReadinessCompositionResult {
  const records = mergeProjectReadinessRecords(acceptedCandidates.map(({ record }) => record));
  return {
    acceptedCandidates,
    rejectedRecords: [],
    records,
    treeRecords: records,
    derivationWarnings: [],
    sourceWarnings: [],
    indeterminate: false,
    oracleResult: null,
    view: {
      title: "Candidate",
      records,
      derivationWarnings: [],
      sourceWarnings: [],
      indeterminate: false,
    },
  };
}

const readyDeps: DecomposeReadinessDeps = {
  readinessProvider: {
    resolve: ({ candidates }) =>
      new Map(candidates.map(({ slug }) => [slug, { kind: "ready" as const }])),
  },
};

function preparationWithExistingDestination(): V3DecomposePreparation {
  const preparation = structuredClone(v3DecompositionEvidenceFixture().preparation);
  const completedMap = preparation.facts.completedMap;
  completedMap.authoring.shape = "heterogeneous";
  completedMap.authoring.destinations = [
    {
      kind: "existing-home",
      destinationId: "existing",
      target: { kind: "work-unit", slug: "existing" },
    },
    ...completedMap.authoring.destinations,
  ];
  const candidatePublication = v3CandidatePublication(
    completedMap,
    preparation.facts.candidatePublication.logicalAnchor,
  );
  const cutMapDigest = v3CutMapDigest(completedMap);
  const planId = v3PlanId({
    preflightId: preparation.facts.preflightId,
    cutMapDigest,
    allowedPathsDigest: preparation.facts.allowedPathsDigest,
    candidatePublication,
    topologyDigest: preparation.facts.topology.digest,
  });
  preparation.facts.cutMapDigest = cutMapDigest;
  preparation.facts.candidatePublication = candidatePublication;
  preparation.facts.destinationOutputPaths = [
    {
      destinationId: "existing",
      paths: [preparation.facts.destinationOutputPaths[0]!.paths[0]!],
    },
    ...preparation.facts.destinationOutputPaths,
  ];
  preparation.facts.prospectiveProjection.overlay.planId = planId;
  preparation.preparationId = v3PreparationId({
    receiptId: preparation.receiptId,
    planId,
    resultBaseHead: completedMap.machine.resultBase.head,
    sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
    sourceInventoryDigest: preparation.facts.sourceInventoryDigest,
    incomingEdgeInventoryDigest: preparation.facts.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: preparation.facts.outgoingEdgeInventoryDigest,
    cutMapDigest,
    allowedPathsDigest: preparation.facts.allowedPathsDigest,
    candidateOwnership: preparation.facts.candidateOwnership,
    candidatePublication,
    topologyDigest: preparation.facts.topology.digest,
    destinationOutputPaths: preparation.facts.destinationOutputPaths,
    prospectiveProjection: preparation.facts.prospectiveProjection,
  });
  const parsed = parseV3DecomposePreparation(preparation);
  if (parsed === null) throw new Error("existing-destination fixture must remain canonical");
  return parsed;
}

describe("validateV3DecomposeContinuation", () => {
  it.each([
    { kind: "selected" as const, slugs: ["member-a"] },
    { kind: "selected" as const, slugs: ["member-a", "member-b"] },
    { kind: "none" as const },
  ])("joins a ready or explicit-none continuation to preparation publication", (continuation) => {
    const { preparation } = v3DecompositionEvidenceFixture();

    expect(validateV3DecomposeContinuation({
      continuation,
      preparation,
      composition: composition(),
      deps: readyDeps,
    })).toEqual({
      status: "validated",
      publication: {
        ...preparation.facts.candidatePublication,
        initialContinuation: continuation,
      },
    });
  });

  it.each([
    [
      "malformed",
      { kind: "selected", slugs: [] },
      [{ code: "continuation-malformed", locus: "continuation.slugs" }],
    ],
    [
      "absent",
      { kind: "selected", slugs: ["member-c"] },
      [{ code: "selection-absent", locus: "continuation.slugs[0]", slug: "member-c" }],
    ],
    [
      "reordered",
      { kind: "selected", slugs: ["member-b", "member-a"] },
      [{ code: "selection-order-mismatch", locus: "continuation.slugs[1]", slug: "member-a" }],
    ],
    [
      "repeated",
      { kind: "selected", slugs: ["member-a", "member-a"] },
      [{ code: "selection-duplicate", locus: "continuation.slugs[1]", slug: "member-a" }],
    ],
  ] as const)("refuses a %s selection without mutating preparation or receipt bytes", (_label, continuation, issues) => {
    const { preparation, receipt } = v3DecompositionEvidenceFixture();
    const preparationBytes = canonicalize(preparation);
    const receiptBytes = canonicalize(receipt);

    expect(validateV3DecomposeContinuation({
      continuation,
      preparation,
      composition: composition(),
      deps: readyDeps,
    })).toEqual({ status: "refused", issues });
    expect(canonicalize(preparation)).toBe(preparationBytes);
    expect(canonicalize(receipt)).toBe(receiptBytes);
  });

  it("preserves the selected slug, selection locus, and provider blockers", () => {
    const { preparation } = v3DecompositionEvidenceFixture();

    expect(validateV3DecomposeContinuation({
      continuation: { kind: "selected", slugs: ["member-a"] },
      preparation,
      composition: composition(),
      deps: {
        readinessProvider: {
          resolve: ({ candidates }) => new Map(candidates.map(({ slug }) => [
            slug,
            slug === "member-a"
              ? {
                  kind: "blocked" as const,
                  blockers: [{ code: "provider-blocked" as const, locus: "provider:member-a" }],
                }
              : { kind: "ready" as const },
          ])),
        },
      },
    })).toEqual({
      status: "refused",
      issues: [{
        code: "selection-blocked",
        locus: "continuation.slugs[0]",
        slug: "member-a",
        blockers: [{ code: "provider-blocked", locus: "provider:member-a" }],
      }],
    });
  });

  it("refuses an existing destination before readiness resolution", () => {
    const preparation = preparationWithExistingDestination();

    expect(validateV3DecomposeContinuation({
      continuation: { kind: "selected", slugs: ["existing"] },
      preparation,
      composition: composition(),
      deps: readyDeps,
    })).toEqual({
      status: "refused",
      issues: [{
        code: "selection-existing-destination",
        locus: "continuation.slugs[0]",
        slug: "existing",
      }],
    });
  });

  it("treats dependency drift in the pinned composition as a blocked selection", () => {
    const { preparation } = v3DecompositionEvidenceFixture();
    const memberA = candidate("member-a", { dependsOn: ["missing-dependency"] });

    expect(validateV3DecomposeContinuation({
      continuation: { kind: "selected", slugs: ["member-a"] },
      preparation,
      composition: composition([memberA, candidate("member-b")]),
      deps: readyDeps,
    })).toEqual({
      status: "refused",
      issues: [{
        code: "selection-blocked",
        locus: "continuation.slugs[0]",
        slug: "member-a",
        blockers: [{
          code: "dependency-missing",
          locus: `${memberA.path}:Depends On:missing-dependency`,
        }],
      }],
    });
  });

  it("refuses a publication member missing from the pinned candidate composition", () => {
    const { preparation } = v3DecompositionEvidenceFixture();

    expect(validateV3DecomposeContinuation({
      continuation: { kind: "selected", slugs: ["member-a"] },
      preparation,
      composition: composition([candidate("member-b")]),
      deps: readyDeps,
    })).toEqual({
      status: "refused",
      issues: [{
        code: "selection-refused",
        locus: "continuation.slugs[0]",
        slug: "member-a",
        blockers: [{
          code: "record-missing",
          locus: "project-record:member-a",
        }],
      }],
    });
  });
});
