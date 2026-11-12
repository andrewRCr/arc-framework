/** Author-only rewrite attribution preserves tasks, exclusions, and repository boundaries. */
import { expect, it } from "vitest";
import { planTaskCaptures } from "../../../src/lib/work-unit/task-attribution.js";
const key = (patch: string) => `v1:${"a".repeat(64)}:${patch.repeat(64)}`;
const original = { repository: "repo", sha: "a".repeat(40), copyKey: key("b") };
const rewritten = { sha: "c".repeat(40), copyKey: key("c"), authorTime: 1, committerTime: 2 };
const branch = { repository: "repo", ref: "feat/demo", linkedAs: "created" as const, excluded: [] };
it("a changed rewrite goes to every task with that author half", () => {
  const plan = planTaskCaptures({ links: { taskCaptures: { "1.1": [original], "1.2": [{ ...original, sha: "b".repeat(40) }] } }, branch,
    ids: ["1.3"], commits: [rewritten], explicit: false });
  expect(plan.taskCaptures["1.1"]?.map((item) => item.sha)).toEqual([original.sha, rewritten.sha]);
  expect(plan.taskCaptures["1.2"]?.map((item) => item.sha)).toEqual(["b".repeat(40), rewritten.sha]);
  expect(plan.uncapturedTasks).toEqual(["1.3"]);
});
it("a task match wins over an exclusion match, and different repositories never match", () => {
  const plan = planTaskCaptures({ links: { taskCaptures: { "1.1": [original], "1.2": [{ ...original, repository: "other" }] } },
    branch: { ...branch, excluded: [original] }, ids: ["1.3"], commits: [rewritten], explicit: false });
  expect(plan.attributions).toEqual([{ sha: rewritten.sha, matched: original.sha, task: "1.1", excluded: false }]);
  expect(plan.branch.excluded).toEqual([original]);
  expect(plan.taskCaptures["1.2"]).toEqual([{ ...original, repository: "other" }]);
});
it("explicit work captures directly and removes every equivalent exclusion", () => {
  const plan = planTaskCaptures({ links: {}, branch: { ...branch, excluded: [original, { ...original, sha: "b".repeat(40) }] }, ids: ["1.1"],
    commits: [{ ...rewritten, copyKey: original.copyKey }], explicit: true });
  expect(plan.branch.excluded).toEqual([]);
  expect(plan.attributions).toEqual([]);
  expect(plan.taskCaptures["1.1"]?.[0]?.sha).toBe(rewritten.sha);
});
