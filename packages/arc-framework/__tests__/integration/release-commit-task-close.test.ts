/** Task closure follows the real commit outcome across Git's accepted option grammar. */
import { afterEach, expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { runTaskClose } from "../../src/lib/work-unit/verbs/task-close.js";
import { createTaskCloseOperations } from "../../src/handlers/release/task-close.js";
import { runReleaseCommit, type ReleaseCommitDeps } from "../../src/handlers/release/commit.js";
import { createSpawnGit, createRemoteRefsContainingHead } from "../../src/handlers/release/commit-cli.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { ARC_CONFIG_FIELDS, type ConfigSettings } from "../../src/lib/config/schema.js";
import { recordReferences } from "../../src/lib/store/identity.js";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await cleanupTempDir(root); });
async function fixture() {
  const cwd = await createTempRepo("arc-release-task-close-"); roots.push(cwd);
  const exec = makeGitExec(cwd);
  await exec("git", ["branch", "-M", "main"]);
  await writeFile(join(cwd, "work"), "base\n"); await exec("git", ["add", "work"]); await exec("git", ["commit", "-m", "base"]);
  await exec("git", ["switch", "-c", "feat/demo"]); await mkdir(join(cwd, ".arc", "active"), { recursive: true });
  const h = createLifecycleHarness(), primary = await h.seedMeta("demo", { taskList: "tasks-demo.md" }, { kind: "active" },
    { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  const tasks = await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: demo\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Work**\n");
  const ctx = { store: h.store, cwd, exec, slug: "demo", projectId: async () => "repo", baseBranch: "main" };
  const deps: ReleaseCommitDeps = { cwd, identity: "test-user", currentBranch: "feat/demo", argv: [], stateOffBranch: true,
    settings: { settings: Object.fromEntries(ARC_CONFIG_FIELDS.map((field) => [field.key, field.defaultValue])) as ConfigSettings,
      resolved: { commitInterlock: { value: "on-task-approval", source: "git-config" }, pushInterlock: { value: "manual", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" }, notesPush: { value: "on-sync", source: "default" }, releaseOptedIn: { value: "true", source: "git-config" } },
      defaultsApplied: [], warnings: [] },
    spawnGit: createSpawnGit(resolveProcessInteractionContext({ noInput: true, machineReadable: false, yes: "absent" }), false),
    resolveHead: async () => (await exec("git", ["rev-parse", "HEAD"])).stdout.trim(), listRemoteRefsContainingHead: createRemoteRefsContainingHead(exec),
    preflightCommitMessage: async () => ({ kind: "pass-through" }), createMessageSnapshot: async () => { throw new Error("No snapshot expected"); },
    persistMessageRetry: async () => { throw new Error("No commit failure expected"); }, cleanupConsumedMessageRetry: async () => false,
    preflightRemedy: "Repair message", writeStderr: () => {}, appendAudit: async () => ({ ok: true }),
    taskClose: createTaskCloseOperations([], async () => ctx, () => {}) };
  await writeFile(join(cwd, "work"), "unfinished work\n"); await exec("git", ["add", "work"]);
  return { ...h, ctx, deps, tasks, exec, head: () => deps.resolveHead({ cwd }) };
}
it("leaves staged work and tasks open for every preview form Git accepts", async () => {
  const h = await fixture(), before = await h.head();
  for (const args of [["--dry-run"], ["--dry-r"], ["--porc"], ["--sho"], ["--lon"], ["-z"], ["--no-dry-run", "--dry-run"]]) {
    expect(await runReleaseCommit({ ...h.deps, argv: [...args, "-m", "feat: work"] })).toEqual({ exitCode: 0 });
    expect(await h.head()).toBe(before);
    expect(lifecycleSuccess(await h.store.read({ reference: h.tasks.reference }))).toEqual(h.tasks);
    expect((await h.exec("git", ["diff", "--cached", "--name-only"])).stdout.trim()).toBe("work");
  }
}, 30_000);
it("closes after an actual commit when later options negate preview and a message operand resembles preview", async () => {
  const h = await fixture(), before = await h.head();
  expect(await runReleaseCommit({ ...h.deps, argv: ["--dry-run", "--no-dry-run", "-m", "--porcelain"] })).toEqual({ exitCode: 0 });
  const after = await h.head(); expect(after).not.toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.tasks.reference })).content).toContain("`[x]` **1.1 Work**");
  expect(lifecycleSuccess(await h.store.read({ reference: h.tasks.reference })).links).toBeUndefined();
  const meta = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/meta"](h.tasks.reference.owner) }));
  expect(meta.links?.taskCaptures?.["1.1"]).toEqual([expect.objectContaining({ repository: "repo", sha: after })]);
}, 30_000);

it("keeps a committed change recoverable when the final HEAD observation fails", async () => {
  const h = await fixture(), before = await h.head(); let reads = 0;
  const result = await runReleaseCommit({ ...h.deps, argv: ["-m", "feat: work"], resolveHead: async (options) => {
    if (++reads === 2) throw new Error("HEAD observation unavailable");
    return h.deps.resolveHead(options);
  } });
  expect(result).toMatchObject({ exitCode: 1, continuation: { argv: ["arc", "task", "close", "1.1"] } });
  const after = await h.head(); expect(after).not.toBe(before);
  expect(lifecycleSuccess(await h.store.read({ reference: h.tasks.reference }))).toEqual(h.tasks);
  expect(await runTaskClose(h.ctx)).toMatchObject({ status: "closed", captured: [after] });
  expect(await h.head()).toBe(after);
  expect(lifecycleSuccess(await h.store.read({ reference: h.tasks.reference })).content).toContain("`[x]` **1.1 Work**");
}, 30_000);
