/** Carrying an Owner selection across a segment whose only change is the Candidate record recording it. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/canonical/canonical-json.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
  type CandidateReviewApplicabilitySelectionV1,
} from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { projectMechanicalReviewApplicabilityCarry } from
  "../../../../../src/scripts/review-gate/policy/mechanical-review-applicability-carry.js";
import {
  classifyReviewContributionApplicability,
  type ReviewContributionApplicabilitySelector,
} from "../../../../../src/scripts/review-gate/policy/review-contribution-applicability.js";

const oid = (character: string): string => character.repeat(40);
const RECORD_PATH = ".arc/system/.internal/candidates/example.json";

function decision(selector: ReviewContributionApplicabilitySelector, paths: string[]) {
  const projection = classifyReviewContributionApplicability(selector, {
    endpoints: {
      before: {
        predecessor: { head: selector.priorBase, tree: oid("3") },
        member: { head: selector.priorHead, tree: oid("4") },
      },
      after: {
        predecessor: { head: selector.currentBase, tree: oid("5") },
        member: { head: selector.currentHead, tree: oid("6") },
      },
    },
    proof: { status: "refused", reason: "contribution-diverged", paths },
  });
  if (projection.state !== "decision-required") throw new Error("expected a decision fixture");
  return projection;
}

function record(
  transitions: readonly CandidateReviewApplicabilitySelectionV1[],
  source = "feature",
): CandidateManagedRecordV1 {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "example",
      subject: createCandidateSubjectSnapshot([{
        path: "src/example.ts",
        mode: "100644",
        digest: canonicalDigest({ source: "feature" }),
        treatment: "reviewable",
      }]),
      baseRevision: oid("1"),
      attestedBy: "andrew",
      attestedAt: "2026-10-02T12:00:00.000Z",
      verificationEvidenceRef: "verification://example",
    }),
    subject,
    transitions: [...transitions],
    lineageAttestations: [],
  };
}

const selectedProjection = decision({
  schemaVersion: 1,
  repositoryId: "repository-1",
  repository: "owner/repository",
  pullRequest: 42,
  lane: "standard",
  sourceId: "coderabbit-pr",
  priorAttemptId: "attempt-prior",
  priorHead: oid("a"),
  currentHead: oid("b"),
  priorBase: oid("1"),
  currentBase: oid("1"),
}, ["notes.md"]);

function selection(selectedAt: string): CandidateReviewApplicabilitySelectionV1 {
  return {
    transitionKind: "review-applicability-selection",
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    candidateId: record([]).attestation.candidateId,
    selector: selectedProjection.selector,
    projectionDigest: selectedProjection.projectionDigest,
    residualDigest: selectedProjection.residualDigest,
    selectedBy: "andrew",
    selectedAt,
    choice: "covered",
  };
}

const carried = selection("2026-10-02T12:01:00.000Z");
const other = selection("2026-10-02T12:02:00.000Z");

async function carry(input: {
  readonly selectedRecord: CandidateManagedRecordV1 | null;
  readonly currentRecord: CandidateManagedRecordV1 | null;
  readonly segmentPaths: string[];
}) {
  const committed = new Map([[oid("b"), input.selectedRecord], [oid("c"), input.currentRecord]]);
  return projectMechanicalReviewApplicabilityCarry({
    candidateId: carried.candidateId,
    projection: decision({ ...selectedProjection.selector, currentHead: oid("c") }, [RECORD_PATH, "notes.md"]),
    selections: [carried],
    projectSelector: async (selector) => decision(
      selector,
      selector.priorHead === oid("b") ? input.segmentPaths : ["notes.md"],
    ),
    ownRecord: { path: RECORD_PATH, read: async (head) => committed.get(head) ?? null },
  });
}

describe("mechanical review applicability carry across the selection's own record commit", () => {
  it.each([
    { name: "only the carried selection", appended: [carried] },
    { name: "the carried selection beside a further one", appended: [carried, other] },
  ])("carries a record commit appending $name", async ({ appended }) => {
    await expect(carry({
      selectedRecord: record([]),
      currentRecord: record(appended),
      segmentPaths: [RECORD_PATH],
    })).resolves.toEqual([expect.objectContaining({ selection: carried, ownRecordPath: RECORD_PATH })]);
  });

  it.each([
    {
      name: "changes a path beside the record",
      selectedRecord: record([]),
      currentRecord: record([carried]),
      segmentPaths: [RECORD_PATH, "notes.md"],
    },
    {
      name: "changes the record beyond appending selections",
      selectedRecord: record([]),
      currentRecord: record([carried], "edited"),
      segmentPaths: [RECORD_PATH],
    },
    {
      name: "records only a different selection",
      selectedRecord: record([]),
      currentRecord: record([other]),
      segmentPaths: [RECORD_PATH],
    },
    {
      name: "has no readable record at the selected head",
      selectedRecord: null,
      currentRecord: record([carried]),
      segmentPaths: [RECORD_PATH],
    },
  ])("does not carry a segment that $name", async (input) => {
    await expect(carry(input)).resolves.toEqual([]);
  });
});
