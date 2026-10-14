/** Real Git rewrites drive the task verb over the checked reference store. */
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, execFileAsync } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { computeCopyKeys } from "../../src/lib/git/copy-key.js";
import { recordPut, batchLifecycleWrites } from "../../src/lib/store/lifecycle-write.js";
import { recordReferences, type Links } from "../../src/lib/store/index.js";
import { runTaskClose, type TaskVerbContext } from "../../src/lib/work-unit/verbs/task-close.js";

let cwd: string; let time: number;
const h = () => createLifecycleHarness();
let records: ReturnType<typeof h>;
let ctx: TaskVerbContext;
const tasks = "# Task List: demo\n\n### `[ ]` **1.1 Work**\n\n- _Goal:_ Implement.\n\n    - `[ ]` **1.1.a Earlier**\n    - `[ ]` **1.1.b Later**\n    - `[ ]` **1.1.c Corrective**\n";
async function git(args: string[], timestamp = ++time, author?: number): Promise<string> {
  return (await execFileAsync("git", args, { cwd, env: { ...process.env, GIT_COMMITTER_DATE: `${timestamp} +0000`, GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true",
    ...(author === undefined ? {} : { GIT_AUTHOR_DATE: `${author} +0000` }), FORCE_COLOR: "0" } })).stdout.trim();
}
async function commit(content: string, timestamp = ++time): Promise<string> {
  await writeFile(join(cwd, "work.txt"), content); await git(["add", "work.txt"]);
  await git(["commit", "-m", "increment"], timestamp, timestamp);
  return git(["rev-parse", "HEAD"]);
}
async function meta() { return lifecycleSuccess(await ctx.store!.lookup({ kind: "slug", slug: SlugSchema.parse("demo") })).reference; }
async function links(): Promise<Links> { return lifecycleSuccess(await ctx.store!.read({ reference: await meta() })).links ?? {}; }
async function putLinks(value: Links) {
  const prior = lifecycleSuccess(await records.store.read({ reference: await meta() }));
  lifecycleSuccess(await batchLifecycleWrites(records.store, [recordPut(prior, { links: value })], { verb: "seed-links", lifecycleAction: "capture" }));
}
async function capture(sha: string) {
  const result = (await computeCopyKeys({ cwd, commits: [sha] })).get(sha);
  return { repository: "repo", sha, ...(result?.copyKey === undefined ? {} : { copyKey: result.copyKey }) };
}
beforeEach(async () => {
  cwd = await createTempRepo("arc-task-rewrite-"); time = 1700000000;
  await commit("base\n"); await git(["branch", "-M", "main"]); await git(["switch", "-c", "feat/demo"]);
  records = h();
  const primary = await records.seedMeta("demo", {}, { kind: "active" }, { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  await records.seed(recordReferences["work-item/task-list"](primary.reference.owner), tasks);
  ctx = { store: records.store, projectId: async () => "repo", cwd, slug: "demo", baseBranch: "main", exec: createExecaGitExec(), execRaw: createExecaRawGitExec(cwd) };
});
afterEach(async () => { await cleanupTempDir(cwd); });

it("default close after an explicit earlier close captures only the rest", async () => {
  const earlier = await commit("earlier\n"); const later = await commit("later\n");
  expect((await runTaskClose(ctx, { ids: ["1.1.a"], commits: [earlier] })).status).toBe("closed");
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: [later] });
  expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier]);
  expect((await links()).taskCaptures?.["1.1.b"]?.map((item) => item.sha)).toEqual([later]);
});
it.each(["created", "adopted", "reattached"])("unchanged hand rebase on a %s branch captures only new work", async (arm) => {
  const earlier = await commit("earlier\n"); const prior = await capture(earlier);
  await putLinks({ branches: [{ repository: "repo", ref: "feat/demo", linkedAs: arm === "adopted" ? "adopted" : "created", excluded: arm === "created" ? [] : [prior] }],
    ...(arm === "created" ? { taskCaptures: { "1.1.a": [prior] } } : {}) });
  await git(["switch", "main"]); await writeFile(join(cwd, "base-change.txt"), "new base\n"); await git(["add", "."]); await git(["commit", "-m", "base advance"], ++time, time);
  await git(["switch", "feat/demo"]); await git(["rebase", "main"]);
  const copied = await git(["rev-parse", "HEAD"]); expect(copied).not.toBe(earlier);
  const fresh = await commit("fresh\n");
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: [fresh] });
});
it("ARC remap keeps old captures and matches both an updated and a lagging checkout", async () => {
  const earlier = await commit("earlier\n"); const old = await capture(earlier);
  await git(["commit", "--amend", "-m", "rewritten message"]);
  const rewritten = await git(["rev-parse", "HEAD"]); const remapped = await capture(rewritten);
  await putLinks({ ...(await links()), taskCaptures: { "1.1.a": [old, remapped] } });
  const fresh = await commit("fresh\n");
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: [fresh] });
  await git(["reset", "--hard", earlier]);
  expect(await runTaskClose(ctx, { ids: ["1.1.c"] })).toMatchObject({ status: "closed", captured: [], attributions: [] });
});
it("message-only amend produces an empty set; content amend adds to its original task", async () => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  await git(["commit", "--amend", "-m", "message only"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.a"] })).toMatchObject({ status: "closed", changed: false, captured: [] });
  await writeFile(join(cwd, "work.txt"), "earlier amended\n"); await git(["add", "."]); await git(["commit", "--amend", "--no-edit"]);
  const amended = await git(["rev-parse", "HEAD"]);
  const result = await runTaskClose(ctx, { ids: ["1.1.a"] });
  expect(result).toMatchObject({ status: "closed", attributions: [{ sha: amended, matched: earlier, task: "1.1.a", excluded: false }] });
  expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier, amended]);
});
it("a content amend of excluded work stays excluded and reports its original", async () => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier); const prior = await links();
  await putLinks({ ...prior, branches: prior.branches?.map((branch) => ({ ...branch, excluded: [original] })) });
  await writeFile(join(cwd, "work.txt"), "excluded plus correction\n"); await git(["add", "."]); await git(["commit", "--amend", "--no-edit"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", attributions: [{ sha: rewritten, matched: earlier, excluded: true }] });
  expect((await links()).branches?.[0]?.excluded.map((item) => item.sha)).toEqual([earlier, rewritten]);
});
it.each(["captured", "excluded"])("raw commit -C routes changed work to the %s original", async (where) => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier);
  const prior = await links();
  await putLinks(where === "captured" ? { ...prior, taskCaptures: { "1.1.a": [original] } }
    : { ...prior, branches: prior.branches?.map((branch) => ({ ...branch, excluded: [original] })) });
  await writeFile(join(cwd, "work.txt"), "different work\n"); await git(["add", "."]); await git(["commit", "-C", earlier]);
  const copied = await git(["rev-parse", "HEAD"]);
  const result = await runTaskClose(ctx, { ids: ["1.1.b"] });
  expect(result).toMatchObject({ status: "closed", attributions: [{ sha: copied, matched: earlier, excluded: where === "excluded" }], uncapturedTasks: ["1.1.b"] });
  if (where === "captured") expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier, copied]);
  else expect((await links()).branches?.[0]?.excluded.map((item) => item.sha)).toEqual([earlier, copied]);
});
it("a fresh commit in a captured author's second belongs to the new task", async () => {
  const sameSecond = ++time; const earlier = await commit("earlier\n", sameSecond);
  await runTaskClose(ctx, { ids: ["1.1.a"] });
  const fresh = await commit("fresh\n", sameSecond);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: [fresh], attributions: [] });
  expect((await links()).taskCaptures?.["1.1.b"]?.[0]?.sha).toBe(fresh);
  expect((await links()).taskCaptures?.["1.1.a"]?.[0]?.sha).toBe(earlier);
});
it("a stored patch-half mismatch still attributes a rewrite by its author half", async () => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier);
  if (original.copyKey === undefined) throw new Error("fixture lacks its key");
  original.copyKey = `${original.copyKey.slice(0, 68)}${"f".repeat(64)}`;
  await putLinks({ ...(await links()), taskCaptures: { "1.1.a": [original] } });
  await git(["commit", "--amend", "-m", "rewritten"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", attributions: [{ sha: rewritten, matched: earlier, task: "1.1.a" }] });
});
it("a change reverted and made again in a later second is captured as new work", async () => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  await commit("base\n"); const renewed = await commit("earlier\n");
  const result = await runTaskClose(ctx, { ids: ["1.1.b"] });
  expect(result).toMatchObject({ status: "closed", captured: expect.arrayContaining([renewed]), attributions: [] });
  expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier]);
});
it("explicit capture cannot reach a commit via a replace-ref graft", async () => {
  const parent = await git(["rev-parse", "HEAD"]); const work = await commit("work\n");
  await git(["switch", "--orphan", "unrelated"]); const unrelated = await commit("unrelated\n");
  await git(["switch", "feat/demo"]); await git(["replace", "--graft", parent, unrelated]);
  const before = await links();
  expect(await runTaskClose(ctx, { ids: ["1.1.a"], commits: [unrelated] })).toMatchObject({ status: "refused", code: "commit-unreachable" });
  expect(await links()).toEqual(before); expect(await git(["rev-parse", "HEAD"])).toBe(work);
});
it("an explicit absent commit refuses without changing records", async () => {
  const before = await links();
  expect(await runTaskClose(ctx, { ids: ["1.1.a"], commits: ["f".repeat(40)] })).toMatchObject({ status: "refused", code: "commit-unreachable" });
  expect(await links()).toEqual(before);
});

it.each(["captured", "excluded"])("interactive fixup or squash attributes its %s original", async (where) => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier); const prior = await links();
  await putLinks(where === "captured" ? { ...prior, taskCaptures: { "1.1.a": [original] } }
    : { ...prior, branches: prior.branches?.map((branch) => ({ ...branch, excluded: [original] })) });
  await writeFile(join(cwd, "work.txt"), "earlier plus correction\n"); await git(["add", "."]);
  await git(["commit", where === "captured" ? "--fixup" : "--squash", earlier]);
  await git(["rebase", "-i", "--autosquash", "main"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed",
    attributions: [{ sha: rewritten, matched: earlier, excluded: where === "excluded" }], uncapturedTasks: ["1.1.b"] });
});
it.each(["captured", "excluded"])("conflict-resolved cherry-pick attributes its %s original", async (where) => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier); const prior = await links();
  await putLinks(where === "captured" ? { ...prior, taskCaptures: { "1.1.a": [original] } }
    : { ...prior, branches: prior.branches?.map((branch) => ({ ...branch, excluded: [original] })) });
  await git(["reset", "--hard", "main"]); const newBase = await commit("different base\n"); await git(["update-ref", "refs/heads/main", newBase]);
  await expect(git(["cherry-pick", earlier])).rejects.toMatchObject({ code: 1 });
  await writeFile(join(cwd, "work.txt"), "cherry-pick repair\n"); await git(["add", "."]); await git(["cherry-pick", "--continue"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed",
    attributions: [{ sha: rewritten, matched: earlier, excluded: where === "excluded" }] });
});
it.each(["ordinary", "equal-times"])("content-changing %s rebase follows header attribution", async (mode) => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  await git(["switch", "main"]); const newBase = await commit("new base\n"); await git(["switch", "feat/demo"]);
  await expect(git(["rebase", ...(mode === "equal-times" ? ["--committer-date-is-author-date"] : []), newBase])).rejects.toMatchObject({ code: 1 });
  await writeFile(join(cwd, "work.txt"), "rebased repair\n"); await git(["add", "."]); await git(["rebase", "--continue"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  const result = await runTaskClose(ctx, { ids: ["1.1.b"] });
  expect((await links()).taskCaptures?.["1.1.a"]?.some((item) => item.sha === earlier)).toBe(true);
  expect(result).toMatchObject(mode === "ordinary" ? { status: "closed", attributions: [{ sha: rewritten, task: "1.1.a" }] }
    : { status: "closed", attributions: [], captured: [rewritten] });
});
it.each(["--committer-date-is-author-date", "--ignore-date"])("unchanged rebase with %s applies its identity rule", async (flag) => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  await git(["switch", "main"]); await writeFile(join(cwd, "base-other.txt"), "advance\n"); await git(["add", "."]); await git(["commit", "-m", "advance"]);
  await git(["switch", "feat/demo"]); await git(["rebase", flag, "main"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: flag === "--ignore-date" ? [rewritten] : [], attributions: [] });
  expect((await links()).taskCaptures?.["1.1.a"]?.some((item) => item.sha === earlier)).toBe(true);
});
async function configureAdvancedOrigin(tip: string): Promise<void> {
  const remote = join(cwd, "origin.git"); await execFileAsync("git", ["clone", "--bare", cwd, remote]);
  await execFileAsync("git", ["update-ref", "refs/heads/main", tip], { cwd: remote });
  const oldBase = await git(["rev-parse", "main"]);
  await git(["remote", "add", "origin", remote]); await git(["update-ref", "refs/remotes/origin/main", oldBase]);
}
it("a base refresh that shrinks a stale set captures only remaining task work", async () => {
  const landed = await commit("landed\n"); const own = await commit("own\n"); await configureAdvancedOrigin(landed);
  expect(await runTaskClose(ctx, { ids: ["1.1.a"] })).toMatchObject({ status: "closed", captured: [own], warnings: [] });
  expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([own]);
});
it("a base refresh that empties a stale set records nothing until its explicit rerun", async () => {
  const landed = await commit("landed\n"); await configureAdvancedOrigin(landed); const before = await links();
  expect(await runTaskClose(ctx)).toMatchObject({ status: "refused", code: "base-emptied-set", reason: expect.stringContaining(landed) });
  expect(await links()).toEqual(before);
  expect(await runTaskClose(ctx)).toMatchObject({ status: "closed", captured: [] });
});
it("a behind checkout and its pull-rebase capture only their own new commits", async () => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  const base = await git(["rev-parse", "main"]); await configureAdvancedOrigin(base);
  const peer = join(cwd, "peer"); await execFileAsync("git", ["clone", "--branch", "feat/demo", join(cwd, "origin.git"), peer]);
  const peerGit = async (args: string[]) => (await execFileAsync("git", ["-c", "user.name=Peer", "-c", "user.email=peer@example.com", ...args],
    { cwd: peer, env: { ...process.env, GIT_EDITOR: "true", FORCE_COLOR: "0" } })).stdout.trim();
  await peerGit(["switch", "main"]); await writeFile(join(peer, "advanced-base.txt"), "base advanced\n"); await peerGit(["add", "."]); await peerGit(["commit", "-m", "new base"]);
  await peerGit(["switch", "feat/demo"]); await peerGit(["rebase", "main"]);
  await writeFile(join(peer, "peer.txt"), "peer work\n"); await peerGit(["add", "."]); await peerGit(["commit", "-m", "peer increment"]);
  await peerGit(["push", "origin", "main"]); await peerGit(["push", "--force-with-lease", "origin", "feat/demo"]);
  const peerHead = await peerGit(["rev-parse", "HEAD"]);
  expect((await runTaskClose({ ...ctx, cwd: peer, execRaw: createExecaRawGitExec(peer) }, { ids: ["1.1.b"] })).status).toBe("closed");
  expect(await runTaskClose(ctx, { ids: ["1.1.c"] })).toMatchObject({ status: "closed", captured: [] });
  await writeFile(join(cwd, "local.txt"), "own work\n"); await git(["add", "local.txt"]); await git(["commit", "-m", "local increment"], ++time, time);
  await git(["pull", "--rebase", "origin", "feat/demo"]);
  const ownHead = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.c"] })).toMatchObject({ status: "closed", captured: [ownHead] });
  const all = (await links()).taskCaptures;
  expect(all?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier]);
  expect(all?.["1.1.b"]?.map((item) => item.sha)).toEqual([peerHead]);
  expect(all?.["1.1.c"]?.map((item) => item.sha)).toEqual([ownHead]);
});
it("a partial clone matches an already captured SHA without fetching its absent blobs", async () => {
  const earlier = await commit("earlier\n"); await runTaskClose(ctx, { ids: ["1.1.a"] });
  await git(["config", "uploadpack.allowFilter", "true"]);
  const clone = join(cwd, "partial"); await execFileAsync("git", ["clone", "--no-checkout", "--branch", "feat/demo", "--filter=blob:none", `file://${cwd}`, clone]);
  const raw = createExecaRawGitExec(clone);
  const missingBefore = await raw(["rev-list", "--objects", "--missing=print", "HEAD"], { objectAccess: "local-only" });
  expect(Buffer.from(missingBefore.stdout).toString()).toContain("?");
  expect(await runTaskClose({ ...ctx, cwd: clone, execRaw: raw }, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", captured: [], attributions: [] });
  expect(await raw(["rev-list", "--objects", "--missing=print", "HEAD"], { objectAccess: "local-only" })).toEqual(missingBefore);
  expect((await links()).taskCaptures?.["1.1.a"]?.map((item) => item.sha)).toEqual([earlier]);
});

it("a content-changing rebase of excluded work stays excluded", async () => {
  const earlier = await commit("earlier\n"); const original = await capture(earlier); const prior = await links();
  await putLinks({ ...prior, branches: prior.branches?.map((branch) => ({ ...branch, excluded: [original] })) });
  await git(["switch", "main"]); await commit("new base\n"); await git(["switch", "feat/demo"]);
  await expect(git(["rebase", "main"])).rejects.toMatchObject({ code: 1 });
  await writeFile(join(cwd, "work.txt"), "rebased excluded repair\n"); await git(["add", "."]); await git(["rebase", "--continue"]);
  const rewritten = await git(["rev-parse", "HEAD"]);
  expect(await runTaskClose(ctx, { ids: ["1.1.b"] })).toMatchObject({ status: "closed", attributions: [{ sha: rewritten, matched: earlier, excluded: true }] });
  expect((await links()).branches?.[0]?.excluded.map((item) => item.sha)).toEqual([earlier, rewritten]);
});
it("a promoted scale-floor item's existing Errand work remains in the default capture", async () => {
  const errandWork = await commit("Errand increment\n"); const prior = await links();
  await putLinks({ ...prior, branches: [...(prior.branches ?? []), { repository: "repo", ref: "errand/prior", linkedAs: "created", excluded: [] }] });
  expect(await runTaskClose(ctx, { ids: ["1.1.a"] })).toMatchObject({ status: "closed", captured: [errandWork] });
  expect((await links()).taskCaptures?.["1.1.a"]?.[0]?.sha).toBe(errandWork);
});

it("a detached checkout follows the qualified-link repair and then closes successfully", async () => {
  const sha = await commit("work\n");
  const prior = await links();
  await putLinks({ ...prior, branches: prior.branches?.map((branch) => ({ ...branch, ref: "refs/heads/feat/demo" })) });
  await git(["switch", "--detach"]);
  const refused = await runTaskClose(ctx, { ids: ["1.1.a"] });
  expect(refused).toMatchObject({ status: "refused", code: "branch-unlinked" });
  if (refused.status !== "refused") throw Error("Expected detached repair");
  const taskRef = recordReferences["work-item/task-list"]((await meta()).owner);
  expect(lifecycleSuccess(await records.store.read({ reference: taskRef })).content).toBe(tasks);
  const branch = refused.remedy.text.replace(/^Run git switch /u, "").replace(/\.$/u, "");
  await git(["switch", branch]);
  expect(await runTaskClose(ctx, { ids: ["1.1.a"] })).toMatchObject({ status: "closed", captured: [sha] });
  expect((await links()).branches?.[0]?.ref).toBe("refs/heads/feat/demo");
});
