/** Backend-selected continuations separate call inputs from stored review authority. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { buildPrePublicationResumeCommand, readPrePublicationCall } from "../../../src/handlers/review-pre-publication-replay.js";
import { decodePrePublicationReplay, decodePrePublicationReplayV2, replayTokenFromAction } from "../../../src/scripts/review-gate/policy/pre-publication-replay.js";

const candidateId = canonicalDigest({ candidate: 1 }), candidateSubjectDigest = canonicalDigest({ subject: 1 });
const frontline = { scopeMode: "whole-target" };
const standard = { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } };
const choices = [
  { frontline: { ...frontline, ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } }, standard },
  { frontline, standard: { ...standard, ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 } } },
  { frontline, standard: { ...standard, additionalPassAuthorization: { headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } } },
  { frontline, standard: { ...standard, terminus: { mode: "owner-accepted" } } },
];

it.each(choices)("emits only native call inputs while repository replay retains %j", async lanes => {
  const input = { workUnit: "example", candidateId, candidateSubjectDigest,
    judgment: { selfReview: "settled" as const, changeSet: { code: true }, lanes, frontlineCeilingHeadSha: "b".repeat(40) },
    replaySelfReview: "settled" as const, replayLanes: lanes, currentFrontlineHeadSha: "b".repeat(40), frontlineCeilingOverrideApplied: true };
  const command = buildPrePublicationResumeCommand({ ...input, schemaVersion: 2 });
  const token = replayTokenFromAction(command, "example");
  const expected = { candidateId, candidateSubjectDigest, selfReview: "settled", changeSet: { code: true }, lanes: { frontline, standard } };
  expect(decodePrePublicationReplayV2(token)).toEqual(expected);
  const call = await readPrePublicationCall({ resume: token }, { resolveRoot: () => "/native",
    readText: async () => { throw new Error("A replay has no caller source file"); }, boundarySchemaVersion: () => 2 });
  expect(call).toMatchObject({ status: "ready", schemaVersion: 2, replay: expected,
    judgment: { selfReview: "settled", changeSet: { code: true }, lanes: { frontline, standard }, frontlineCeilingHeadSha: undefined } });
  const repositoryToken = replayTokenFromAction(buildPrePublicationResumeCommand({ ...input, schemaVersion: 1 }), "example");
  expect(decodePrePublicationReplay(repositoryToken)).toMatchObject({ lanes, frontlineCeilingHeadSha: "b".repeat(40) });
  expect(await readPrePublicationCall({ resume: repositoryToken }, { resolveRoot: () => "/native",
    readText: async () => "", boundarySchemaVersion: () => 2 })).toMatchObject({ status: "failed", stage: "request" });
});

it("keeps a native call's grants, never its terminus, when its scope refusal retains them", () => {
  const grants = { ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 }, additionalPassAuthorization: {
    headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 2, nextPass: 3 } };
  const lanes = { frontline: { ...frontline, ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } },
    standard: { ...standard, ...grants, terminus: { mode: "owner-accepted" } } };
  const command = buildPrePublicationResumeCommand({ workUnit: "example", candidateId, candidateSubjectDigest,
    judgment: { selfReview: "settled", changeSet: undefined, lanes, frontlineCeilingHeadSha: undefined },
    replaySelfReview: "settled", replayLanes: lanes, currentFrontlineHeadSha: "b".repeat(40),
    frontlineCeilingOverrideApplied: false, schemaVersion: 2, retainGrants: true });
  expect(decodePrePublicationReplayV2(replayTokenFromAction(command, "example"))).toEqual({ candidateId,
    candidateSubjectDigest, selfReview: "settled", lanes: { frontline: lanes.frontline, standard: { ...standard, ...grants } } });
});

it("reports backend-selection failure through the execution error boundary", async () => {
  const error = new Error("Restore the selected review store and retry.");
  expect(await readPrePublicationCall({}, { resolveRoot: () => "/native", readText: async () => "",
    boundarySchemaVersion: () => { throw error; } })).toEqual({ status: "failed", stage: "execution", error });
});
