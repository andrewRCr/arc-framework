/** Supplied host facts carry complete request identities and an explicit auto-merge state. */
import { expect, it } from "vitest";
import { parseWindowCheckInput } from "../../../../src/scripts/cutover-window/input.js";
import { parseWindowPullRequests } from "../../../../src/scripts/cutover-window/host.js";

const request = { number: 7, headBranch: "feat/flip", baseBranch: "main" };
const listing = { open: [request], flip: { ...request, autoMergeArmed: false } };

it("reads a complete supplied listing without dropping its request identities", () => {
  expect(parseWindowPullRequests(JSON.parse(JSON.stringify(listing)), 7)).toEqual(listing);
});

it.each([
  {}, { open: [] }, { flip: listing.flip },
  { ...listing, flip: { ...listing.flip, autoMergeArmed: undefined } },
  { ...listing, flip: { ...listing.flip, autoMergeArmed: null } },
  { ...listing, open: [{ ...request, baseBranch: undefined }] },
  { ...listing, flip: { ...listing.flip, number: 8 } },
  { ...listing, flip: { ...listing.flip, headBranch: "" } },
])("refuses incomplete or mismatched supplied facts %j", value => {
  expect(() => parseWindowPullRequests(JSON.parse(JSON.stringify(value)), 7)).toThrow(expect.objectContaining({
    findings: [expect.objectContaining({ subject: "pull-request listing", remedy: expect.stringContaining("retry") })],
  }));
});


it("parses explicit flip identity and optional rehearsal inputs alongside common flags", () => {
  expect(parseWindowCheckInput(["--repo", "/target", "--flip-branch", "feat/flip", "--flip-pr", "7",
    "--pull-requests", "prs.json", "--anchor", "a".repeat(40), "--json"]))
    .toEqual({ branch: "feat/flip", pullRequest: 7, listing: "prs.json", anchor: "a".repeat(40) });
  expect(parseWindowCheckInput(["--flip-branch", "feat/flip", "--flip-pr", "7"]))
    .toEqual({ branch: "feat/flip", pullRequest: 7 });
});

it.each([
  [], ["--flip-pr", "7"], ["--flip-branch", "feat/flip"],
  ...["0", "-1", "1.5", "abc", "9007199254740992"].map(value => ["--flip-branch", "feat/flip", "--flip-pr", value]),
  ["--flip-branch", "feat/flip", "--flip-pr", "7", "--unknown"],
].map(args => ({ args })))("refuses unusable flip options $args", ({ args }) => {
  expect(() => parseWindowCheckInput(args)).toThrow(expect.objectContaining({ findings: [expect.objectContaining({
    subject: "check options", remedy: expect.stringContaining("retry"),
  })] }));
});
