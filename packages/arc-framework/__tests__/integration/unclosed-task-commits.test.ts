/** The entering checkout lists the exact default close set over its local base refs. */
import { expect, it } from "vitest";
import { makeUnclosedTaskFixture } from "../helpers/unclosed-task-commits.js";
import { computeUnclosedTaskCommits } from "../../src/lib/locus/unclosed-task-commits.js";
import { UnclosedTaskCommitsSchema } from "../../src/lib/locus/unclosed-task-commits-schema.js";
import { prepareTaskClose } from "../../src/lib/work-unit/verbs/task-close.js";
it.each(["adopted", "reactivated", "promoted"] as const)("matches the close set on an %s work unit's branch", async arm => {
  const h = await makeUnclosedTaskFixture(), prior = await h.commit("prior\n"), excluded = await h.capture(prior);
  const fresh = await h.commit("fresh\n");
  await h.putLinks({ branches: [{ repository: "repo", ref: "feat/demo", linkedAs: arm === "adopted" ? "adopted" : "created", excluded: arm === "promoted" ? [] : [excluded] }] });
  const listing = await computeUnclosedTaskCommits(h.input), close = await prepareTaskClose(h.input, {});
  expect(listing?.status).toBe("available"); expect(close.status).toBe("prepared");
  if (listing?.status !== "available" || close.status !== "prepared") throw new Error("Expected the same available default set");
  expect(listing.commits).toEqual(close.snapshot?.commits);
  expect(listing.commits.map(commit => commit.sha)).toEqual(arm === "promoted" ? [fresh, prior] : [fresh]);
  expect(listing.actions).toEqual([{ text: "arc task close", argv: ["arc", "task", "close"], checkout: h.cwd }]);
  expect(UnclosedTaskCommitsSchema.safeParse(listing).success).toBe(true);
});
it("a base merge adds nothing and rebased captured/excluded copies stay out", async () => {
  const h = await makeUnclosedTaskFixture(), excluded = await h.commit("excluded\n"), captured = await h.commit("captured\n");
  await h.putLinks({ branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "adopted", excluded: [await h.capture(excluded)] }], taskCaptures: { "1.1.a": [await h.capture(captured)] } });
  await h.git(["switch", "main"]); await h.commit("base advance\n", "base.txt"); await h.git(["switch", "feat/demo"]); await h.git(["rebase", "main"]);
  const fresh = await h.commit("fresh\n");
  await h.git(["switch", "main"]); await h.commit("another advance\n", "base.txt"); await h.git(["switch", "feat/demo"]); await h.git(["merge", "--no-ff", "--no-edit", "main"]);
  const listing = await computeUnclosedTaskCommits(h.input);
  expect(listing?.status === "available" ? listing.commits.map(commit => commit.sha) : listing).toEqual([fresh]);
});
it("takes exclusions from the checked-out link alone and filters stored capture SHAs", async () => {
  const h = await makeUnclosedTaskFixture(), captured = await h.commit("captured\n"), work = await h.commit("work\n");
  await h.putLinks({ branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }, { repository: "repo", ref: "feat/other", linkedAs: "created", excluded: [await h.capture(work)] }], taskCaptures: { "1.1.a": [await h.capture(captured)] } });
  const listing = await computeUnclosedTaskCommits(h.input);
  expect(listing?.status === "available" ? listing.commits.map(commit => commit.sha) : listing).toEqual([work]);
});
