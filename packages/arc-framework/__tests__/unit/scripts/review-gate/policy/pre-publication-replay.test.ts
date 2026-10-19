/** Persisted replay inputs share their original decoder with the import. */
import { expect, it } from "vitest";
import { decodePrePublicationReplay } from "../../../../../src/scripts/review-gate/policy/pre-publication-replay.js";
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
