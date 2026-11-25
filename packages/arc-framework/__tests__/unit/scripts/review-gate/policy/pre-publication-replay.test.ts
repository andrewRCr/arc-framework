/** Persisted replay inputs share their original decoder with the import. */
import { expect, it } from "vitest";
import { AttestationOrderingRecoverySchema, decodePrePublicationReplay, encodePrePublicationReplayV2, decodePrePublicationReplayV2 } from "../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { PrePublicationLaneJudgmentsSchema } from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";

it.each([
  { frontline: { invocation: { mode: "skip" } } },
  { standard: { terminus: { mode: "owner-accepted" } } },
  { standard: { additionalPassAuthorization: { headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } } },
  { standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } },
  { frontline: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } },
])("decodes the original replay judgment %j through both authorities", (lanes) => {
  const token = Buffer.from(JSON.stringify({ lanes, frontlineCeilingHeadSha: "b".repeat(40) })).toString("base64url");
  const decoded = decodePrePublicationReplay(token);
  expect(PrePublicationLaneJudgmentsSchema.parse(decoded.lanes)).toEqual(lanes);
  expect(decoded.frontlineCeilingHeadSha).toBe("b".repeat(40));
});

it("round-trips caller inputs with an opaque stored boundary version", () => {
  const identity = { candidateId: `sha256:${"a".repeat(64)}`, candidateSubjectDigest: `sha256:${"b".repeat(64)}` };
  const input = { ...identity, selfReview: "settled", changeSet: { code: true },
    lanes: { frontline: { scopeMode: "whole-target", invocation: { mode: "skip" } } },
    attestationOrderingRecovery: { ...identity, reviewedHead: "c".repeat(40), currentHead: "d".repeat(40),
      expectedBoundaryVersion: "backend-version-7" } };
  expect(decodePrePublicationReplayV2(encodePrePublicationReplayV2(input))).toEqual(input);
});

it.each([
  { standard: { terminus: { mode: "owner-accepted" } } },
])("refuses a stored replay containing a review choice: %j", (lanes) => {
  const original = { lanes };
  expect(decodePrePublicationReplay(Buffer.from(JSON.stringify(original)).toString("base64url"))).toEqual(original);
  const refusal = expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({
    code: "unrecognized_keys", path: ["lanes", "standard"], keys: ["terminus"] })]) });
  expect(() => encodePrePublicationReplayV2(original)).toThrow(refusal);
  expect(() => decodePrePublicationReplayV2(Buffer.from(JSON.stringify(original)).toString("base64url"))).toThrow(refusal);
});

it.each([
  { standard: { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } },
  { standard: { additionalPassAuthorization: { headSha: "c".repeat(40), precedingProducerId: "producer-2", completedPasses: 2, nextPass: 3 } } },
  { frontline: { ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } } },
])("round-trips a grant a stored replay keeps until a member subject records it: %j", (lanes) => {
  const original = { lanes };
  expect(decodePrePublicationReplayV2(encodePrePublicationReplayV2(original))).toEqual(original);
});

it.each([`sha256:${"a".repeat(64)}`, "backend:boundary/7"])("accepts the published ordering recovery's stored version %s", version => {
  const recovery = { candidateId: `sha256:${"a".repeat(64)}`, candidateSubjectDigest: `sha256:${"b".repeat(64)}`,
    reviewedHead: "c".repeat(40), currentHead: "d".repeat(40), expectedBoundaryVersion: version };
  expect(AttestationOrderingRecoverySchema.parse(recovery).expectedBoundaryVersion).toBe(version);
});
