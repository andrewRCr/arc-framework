/** Task-close repairs and action precision are retained beside the entering checkout's set. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { makeUnclosedTaskFixture, unclosedTaskList } from "../helpers/unclosed-task-commits.js";
import { computeUnclosedTaskCommits } from "../../src/lib/locus/unclosed-task-commits.js";
import { UnclosedTaskCommitsSchema } from "../../src/lib/locus/unclosed-task-commits-schema.js";
import { prepareTaskClose, runTaskClose } from "../../src/lib/work-unit/verbs/task-close.js";
import { recordPut, batchLifecycleWrites } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences, OwnerIdentitySchema } from "../../src/lib/store/identity.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createStore } from "../../src/lib/store/create.js";
import { testStorePorts } from "../helpers/store/in-repo-ports.js";
it.each(["detached", "unlinked", "ambiguous", "no-link"] as const)("retains close's exact %s condition and repair", async kind => {
  const h = await makeUnclosedTaskFixture();
  const links = (await h.readMeta()).links ?? {};
  if (kind === "detached") await h.git(["switch", "--detach"]);
  if (kind === "unlinked") await h.git(["switch", "-c", "other"]);
  if (kind === "ambiguous") await h.putLinks({ ...links, branches: [...(links.branches ?? []), { repository: "repo", ref: "refs/heads/feat/demo", linkedAs: "created", excluded: [] }] });
  if (kind === "no-link") await h.putLinks({ ...links, branches: [] });
  const listing = await computeUnclosedTaskCommits(h.input), close = await prepareTaskClose(h.input, {});
  expect(listing?.status).toBe("refused"); expect(close.status).toBe("refused");
  if (listing?.status !== "refused" || close.status !== "refused") throw new Error("Expected matching close refusals");
  expect(listing.reason).toBe(close.reason); expect(listing.remedy).toEqual(close.remedy);
  expect(listing.actions).toEqual([{ text: close.remedy.text, checkout: h.cwd }]);
  expect(UnclosedTaskCommitsSchema.safeParse(listing).success).toBe(true);
});
it("reports the project-ID port's failure and defaults an absent port to the project's identity", async () => {
  const h = await makeUnclosedTaskFixture(); await h.commit("work\n");
  const refusal = await computeUnclosedTaskCommits({ ...h.input, projectId: async () => { throw new Error("Identity port failed"); } });
  expect(refusal).toMatchObject({ status: "refused", reason: expect.stringContaining("Identity port failed"), actions: [{ checkout: h.cwd }] });
  const missing = await computeUnclosedTaskCommits({ ...h.input, projectId: undefined });
  expect(missing).toMatchObject({ status: "refused", reason: expect.stringContaining("identity record is missing") });
  const repository = "00000000-0000-4000-8000-000000000001";
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: repository })), "{}");
  await h.putLinks({ branches: [{ repository, ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  expect(await computeUnclosedTaskCommits({ ...h.input, projectId: undefined })).toMatchObject({ status: "available", commits: [{ copyKey: expect.any(String) }] });
});
it.each([false, true])("reports missing base with its %s-origin repair and never fetches", async origin => {
  const h = await makeUnclosedTaskFixture(); await h.git(["branch", "-D", "main"]);
  if (origin) {
    const remote = join(h.cwd, ".git", "unclosed-origin.git");
    await h.git(["init", "--bare", remote]);
    await h.git(["push", remote, "HEAD:refs/heads/integration"]);
    await h.git(["remote", "add", "origin", remote]);
  }
  const remoteRefs = await h.git(["for-each-ref", "--format=%(refname):%(objectname)", "refs/remotes/origin/"]);
  expect(remoteRefs).toBe("");
  const result = await computeUnclosedTaskCommits({ ...h.input, baseBranch: "integration" });
  expect(result).toMatchObject({ status: "refused", code: "base-unavailable", reason: "No base ref resolves for integration." });
  if (result?.status !== "refused") throw new Error("Expected a base repair");
  expect(result.actions[0]).toEqual(origin ? { text: "git fetch origin +refs/heads/integration:refs/remotes/origin/integration", argv: ["git", "fetch", "origin", "+refs/heads/integration:refs/remotes/origin/integration"], checkout: h.cwd }
    : { text: "git branch integration <commit>", checkout: h.cwd });
  expect(await h.git(["for-each-ref", "--format=%(refname):%(objectname)", "refs/remotes/origin/"])).toBe(remoteRefs);
});
it.each(["committer-time", "copy-key"] as const)("keeps an unreadable %s as text rather than a typed close", async failure => {
  const h = await makeUnclosedTaskFixture(), sha = await h.commit("work\n"), raw = h.input.execRaw;
  const listing = await computeUnclosedTaskCommits({ ...h.input, execRaw: async (args, options) => {
    if (failure === "copy-key" && args.includes("diff-tree")) throw new Error("Diff unavailable");
    const result = await raw(args, options);
    if (failure !== "committer-time" || !args.includes("cat-file")) return result;
    const bytes = Buffer.from(result.stdout), start = bytes.indexOf(10) + 1;
    const body = bytes.subarray(start, bytes.length - 1).toString("utf8").replace(/^committer .+$/mu, "committer unreadable");
    return { ...result, stdout: Buffer.from(`${sha} commit ${Buffer.byteLength(body)}\n${body}\n`) };
  } });
  expect(listing?.status).toBe("available");
  if (listing?.status !== "available") throw new Error("Expected commit evidence with an uncertain header/key");
  expect(listing.commits[0]).toMatchObject(failure === "committer-time" ? { copyKey: expect.any(String), committerTime: null } : { authorTime: expect.any(Number), committerTime: expect.any(Number) });
  if (failure === "copy-key") expect(listing.commits[0]).not.toHaveProperty("copyKey");
  expect(listing.actions[0]?.text).toContain("arc task close <id>"); expect(listing.actions[0]).not.toHaveProperty("argv"); expect(listing.actions[0]?.checkout).toBe(h.cwd);
});
it("a raw amend of closed work lists the correction with both close repairs in its checkout", async () => {
  const h = await makeUnclosedTaskFixture(); await h.commit("earlier\n"); expect(await runTaskClose(h.input)).toMatchObject({ status: "closed" });
  await writeFile(join(h.cwd, "work.txt"), "earlier amended\n"); await h.git(["add", "work.txt"]); await h.git(["commit", "--amend", "--no-edit"]);
  const listing = await computeUnclosedTaskCommits(h.input);
  expect(listing?.status).toBe("available"); if (listing?.status !== "available") throw new Error("Expected amended commit");
  expect(listing.commits[0]?.authorTime).not.toBe(listing.commits[0]?.committerTime);
  expect(listing.actions).toEqual([{ text: expect.stringContaining("arc task close if the open task's work"), checkout: h.cwd }]);
  expect(listing.actions[0]?.text).toContain("arc task close <id>");
});
it("a paused work unit lists its set with resume and a close to follow", async () => {
  const h = await makeUnclosedTaskFixture(); await h.commit("work\n"); const meta = await h.readMeta();
  lifecycleSuccess(await batchLifecycleWrites(h.store, [recordPut(meta, { content: `${meta.content}\n## Pause\n\n- **Paused By:** \`test-user\`\n- **Since:** \`2026-10-16T00:00:00Z\`\n- **Reason:** Review\n` })], { verb: "pause", lifecycleAction: "pause" }));
  expect(await computeUnclosedTaskCommits(h.input)).toMatchObject({ status: "available", actions: [{ text: "arc resume demo, then arc task close", argv: ["arc", "resume", "demo"], checkout: h.cwd }] });
});
it("omits Planning work, a work unit with no open task, and the in-repo implementation before any Git read", async () => {
  const planning = await makeUnclosedTaskFixture({ state: "Planning" }), closed = await makeUnclosedTaskFixture({ tasks: unclosedTaskList.replaceAll("[ ]", "[x]") });
  const forbidden = async () => { throw new Error("Git must not be read"); };
  expect(await computeUnclosedTaskCommits({ ...planning.input, exec: forbidden })).toBeNull();
  expect(await computeUnclosedTaskCommits({ ...closed.input, exec: forbidden })).toBeNull();
  expect(await computeUnclosedTaskCommits({ ...closed.input, store: createStore(testStorePorts(closed.cwd, forbidden, forbidden)), exec: forbidden })).toBeNull();
});
