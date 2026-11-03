/** Review paths retain their repository layout through semantic addresses. */
import { expect, it } from "vitest";
import { resolveCandidateRecordRelativePath, resolveSubmissionBoundaryPath } from
  "../../../../../../src/lib/store/kinds/review/paths.js";

it("resolves a Candidate record's established path", () => {
  expect(resolveCandidateRecordRelativePath("record-example"))
    .toBe(".arc/system/.internal/candidates/record-example.json");
});

it("resolves an integration boundary's established path", () => {
  expect(resolveSubmissionBoundaryPath("record-example"))
    .toBe(".arc/system/.internal/candidates/record-example.boundary.json");
});
