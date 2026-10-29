/** Legacy lineage joins retain imported work-item identities and source producer IDs. */
import { expect, it } from "vitest";
import { createReviewMappingWorkItemResolver } from "../../../../../../src/lib/store/kinds/review/mapping-work-items.js";
import type { ReviewMappingInput } from "../../../../../../src/lib/store/kinds/review/mapping-types.js";
import { createCandidateAttestation, parseCandidateManagedRecord, serializeCandidateManagedRecord } from
  "../../../../../../src/lib/work-unit/candidate-attestation.js";
import { candidateFixture } from "../../../../../helpers/store/tracked-write-fixture.js";
import { LaneSubjectLineageSchema } from "../../../../../../src/scripts/review-gate/core/lane-admission.js";

const workItem = { kind: "work-unit" as const, slug: "example", uid: "123e4567-e89b-42d3-a456-426614174000", live: true };

function candidateInput(): ReviewMappingInput {
  const older = candidateFixture();
  const current = { ...older, attestation: createCandidateAttestation({ ...older.attestation, subject: older.subject,
    baseRevision: "b".repeat(40), attestedAt: "2026-08-13T14:00:00Z", supersedes: older.attestation.candidateId }) };
  return { projectId: "project-1", gate: [], workItems: [workItem], candidates: [{ workItem: workItem.uid,
    versions: [older, current].map((record, index) => ({ commit: String(index + 1).repeat(40),
      content: serializeCandidateManagedRecord(record) })), current: null, boundary: null }] };
}

it("resolves a superseded Candidate through the supplied chain to its imported work-item UID", () => {
  const input = candidateInput();
  const older = candidateFixture();
  const resolve = createReviewMappingWorkItemResolver(input);
  expect(resolve({ kind: "candidate", candidateId: older.attestation.candidateId })).toEqual({ outcome: "live", workItem });
});

it("resolves delivery members by work-unit slug", () => {
  const resolve = createReviewMappingWorkItemResolver({ workItems: [workItem], candidates: [] });
  const member = LaneSubjectLineageSchema.parse({ kind: "delivery-member", workUnitId: "example",
    planId: "123e4567-e89b-42d3-a456-426614174003", deliverableId: `sha256:${"d".repeat(64)}` });
  expect(resolve(member)).toEqual({ outcome: "live", workItem });
});

it("resolves Errands by claim ID rather than a reusable slug", () => {
  const errand = { kind: "errand" as const, slug: "same-name", claimId: "claim-live",
    uid: "123e4567-e89b-42d3-a456-426614174001", live: true };
  const older = { ...errand, claimId: "claim-old", uid: "123e4567-e89b-42d3-a456-426614174002", live: false };
  const resolve = createReviewMappingWorkItemResolver({ workItems: [older, errand], candidates: [] });
  expect(resolve({ kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-live", headSha: "a".repeat(40) }))
    .toEqual({ outcome: "live", workItem: errand });
});

const factLineages = [
  { kind: "candidate", candidateId: candidateFixture().attestation.candidateId },
  { kind: "delivery-member", workUnitId: "example", planId: "123e4567-e89b-42d3-a456-426614174003",
    deliverableId: `sha256:${"d".repeat(64)}` },
  { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "claim-ended", headSha: "a".repeat(40) },
].map((lineage) => LaneSubjectLineageSchema.parse(lineage));

it.each(factLineages)("leaves an absent work item's fact behind for $kind", (lineage) => {
  const resolve = createReviewMappingWorkItemResolver({ workItems: [], candidates: [] });
  expect(resolve(lineage)).toEqual({ outcome: "left-behind", reason: "No live work item owns this review fact." });
});

it.each(factLineages)("leaves a pending fact on ended work behind for $kind", (lineage) => {
  const input = candidateInput();
  input.workItems = [{ ...workItem, live: false }, { kind: "errand", slug: "ended", claimId: "claim-ended",
    uid: "123e4567-e89b-42d3-a456-426614174004", live: false }];
  const pending = { outcome: "pending" as const, lineage };
  const resolve = createReviewMappingWorkItemResolver(input);
  expect(resolve(pending.lineage)).toEqual({ outcome: "left-behind", reason: "No live work item owns this review fact." });
});

it("does not infer Candidate ownership through an unresolved supersession chain", () => {
  const input = candidateInput();
  const candidate = input.candidates[0];
  if (candidate === undefined) throw new Error("Expected Candidate history");
  const current = candidate.versions[1];
  if (current === undefined) throw new Error("Expected current Candidate");
  const record = parseCandidateManagedRecord(current.content);
  if (record === null) throw new Error("Expected valid Candidate content");
  candidate.versions = [current];
  const resolve = createReviewMappingWorkItemResolver(input);
  expect(resolve({ kind: "candidate", candidateId: record.attestation.candidateId }))
    .toEqual({ outcome: "left-behind", reason: "No live work item owns this review fact." });
});
