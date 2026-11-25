/** Host decisions cover the live branch set, including a flip without unit metadata. */
import { expect, it } from "vitest";
import { windowPullRequestFindings, windowMergeSettingFindings } from "../../../../src/scripts/cutover-window/pull-requests.js";
import type { WindowPullRequests } from "../../../../src/scripts/cutover-window/host.js";

const baseline: WindowPullRequests = { open: [{ number: 7, headBranch: "feat/flip", baseBranch: "main" }],
  flip: { number: 7, headBranch: "feat/flip", baseBranch: "main", autoMergeArmed: false } };

it.each(["main", "feat/alpha", "feat/flip"])("refuses another request into %s until it is closed", baseBranch => {
  const other = { number: 8, headBranch: "feat/other", baseBranch };
  const check = (requests: WindowPullRequests) => windowPullRequestFindings(requests, ["feat/alpha"], "feat/flip");
  expect(check({ ...baseline, open: [...baseline.open, other] })).toEqual([
    { subject: "pull request #8", condition: expect.stringContaining(baseBranch), remedy: expect.stringContaining("close") },
  ]);
  expect(check(baseline)).toEqual([]);
});

it("refuses the flip's armed auto-merge until it is disarmed", () => {
  expect(windowPullRequestFindings({ ...baseline, flip: { ...baseline.flip, autoMergeArmed: true } }, [], "feat/flip"))
    .toEqual([{ subject: "pull request #7", condition: expect.stringContaining("auto-merge"), remedy: expect.stringContaining("--disable-auto") }]);
  expect(windowPullRequestFindings(baseline, [], "feat/flip")).toEqual([]);
});

it.each(["allowSquash", "allowRebase"] as const)("refuses enabled %s until disabled", key => {
  const settings = { allowSquash: false, allowRebase: false, [key]: true };
  expect(windowMergeSettingFindings(settings)).toEqual([
    { subject: expect.stringContaining(key === "allowSquash" ? "squash" : "rebase"),
      condition: expect.stringContaining("enabled"), remedy: expect.stringContaining("Disable") },
  ]);
  expect(windowMergeSettingFindings({ allowSquash: false, allowRebase: false })).toEqual([]);
});

it("admits a request whose target is outside main and the live branch set", () => {
  const requests = { ...baseline, open: [...baseline.open, { number: 8, headBranch: "feat/other", baseBranch: "feat/inactive" }] };
  expect(windowPullRequestFindings(requests, ["feat/alpha"], "feat/flip")).toEqual([]);
});
