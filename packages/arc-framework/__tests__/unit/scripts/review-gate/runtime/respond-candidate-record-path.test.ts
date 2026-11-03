/** A Candidate response names its record's path only when a tracked file holds that record. */
import { expect, it } from "vitest";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { CANDIDATE_RECORD_PATH, fixture, lineageDependencies, verifiedFixRequest, objectId, candidateSubject,
  candidateLineageBinding } from "../../../../fixtures/respond-command.js";

it.each([
  { mode: "perform", tracked: true }, { mode: "perform", tracked: false },
  { mode: "replay", tracked: true }, { mode: "replay", tracked: false },
] as const)("names the record path on $mode only when tracked is $tracked", async ({ mode, tracked }) => {
  const records = fixture(), current = { revision: objectId("e"), subject: candidateSubject("fixed") };
  const { deps, appends } = lineageDependencies(records, current);
  const written = tracked ? { recordPath: CANDIDATE_RECORD_PATH } : {};
  const append = deps.appendCandidateResponse;
  deps.appendCandidateResponse = async input => { await append(input); return written; };
  deps.stageCandidateResponse = async () => written;
  const request = withReviewReport(verifiedFixRequest(records));
  if (mode === "replay") {
    await respondToReviewCommand(request, deps);
    const advanced = appends[0]?.record;
    if (advanced === undefined) throw new Error("Expected a performed response");
    deps.readCandidateLineage = async () => candidateLineageBinding(records, advanced, current);
  }
  const result = await respondToReviewCommand(request, deps);
  expect(result.state).toBe(mode === "perform" ? "candidate-advanced" : "candidate-current");
  if (tracked) expect(result.payload).toMatchObject({ recordPath: CANDIDATE_RECORD_PATH });
  else expect(result.payload).not.toHaveProperty("recordPath");
});
