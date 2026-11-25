/** Work-branch inference retains promoted Errand links without selecting them as current. */
import { expect, it } from "vitest";
import { selectWorkBranchLink } from "../../../src/lib/store/lifecycle-branch.js";
import type { BranchLink } from "../../../src/lib/store/links.js";
const errand: BranchLink = { repository: "repo", ref: "chore/example", linkedAs: "created", excluded: [] };
const work: BranchLink = { repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] };
const record = { links: { branches: [errand, work] } };
it("uses the actual linked holder branch before insertion order", () => {
  expect(selectWorkBranchLink(record, { repository: "repo", currentBranch: "refs/heads/chore/example" })).toEqual({ kind: "linked", link: errand });
});
it("selects the final repository link when no holder branch is supplied", () => {
  expect(selectWorkBranchLink(record, { repository: "repo" })).toEqual({ kind: "linked", link: work });
});
it("refuses an unlinked or detached holder rather than inferring another link", () => {
  expect(selectWorkBranchLink(record, { repository: "repo", currentBranch: "feat/other" })).toMatchObject({ kind: "ambiguous" });
  expect(selectWorkBranchLink(record, { repository: "repo", currentBranch: null })).toMatchObject({ kind: "ambiguous" });
});
it("preserves repository and canonical-ref ambiguity", () => {
  expect(selectWorkBranchLink({ links: { branches: [errand, { ...work, repository: "other" }] } })).toMatchObject({ kind: "ambiguous" });
  expect(selectWorkBranchLink({ links: { branches: [work, { ...work, ref: "refs/heads/feat/example" }] } }, { repository: "repo" })).toMatchObject({ kind: "ambiguous" });
  expect(selectWorkBranchLink({ links: { branches: [work, { ...work, ref: "refs/heads/feat/example" }] } },
    { repository: "repo", currentBranch: "feat/example" })).toMatchObject({ kind: "ambiguous" });
});
it("has no work branch where this repository has no link", () => {
  expect(selectWorkBranchLink(record, { repository: "other" })).toEqual({ kind: "none" });
});
