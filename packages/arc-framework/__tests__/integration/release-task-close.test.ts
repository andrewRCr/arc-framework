/** The CLI adapter's actual close operations capture real commits into the reference store. */
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeMetaPause, writeMetaState, writeMetaCurrentWorkflow } from "../../src/lib/store/kinds/meta/writers.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createTempRepo, cleanupTempDir, execFileAsync } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { ARC_CONFIG_FIELDS, type ConfigSettings } from "../../src/lib/config/schema.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { createTaskCloseOperations } from "../../src/handlers/release/task-close.js";
import { runReleaseCommit, type ReleaseCommitDeps } from "../../src/handlers/release/commit.js";
import { createRemoteRefsContainingHead, createSpawnGit, stripReleaseCommitOptions } from "../../src/handlers/release/commit-cli.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { recordReferences } from "../../src/lib/store/index.js";
import { TaskCloseCommandInputSchema } from "../../src/handlers/task.js";
import { runTaskClose, type TaskVerbContext } from "../../src/lib/work-unit/verbs/task-close.js";
import { AuditEntrySchema, type AuditEntry } from "../../src/lib/release/schema.js";
let cwd: string;
beforeEach(async () => { cwd = await createTempRepo("arc-release-capture-"); });
afterEach(async () => { await cleanupTempDir(cwd); });
async function fixture(ids?: string) {
  const exec = createExecaGitExec();
  await writeFile(join(cwd, "work.txt"), "base\n");
  await exec("git", ["add", "."], { cwd }); await exec("git", ["commit", "-m", "base"], { cwd });
  await exec("git", ["branch", "-M", "main"], { cwd }); await exec("git", ["switch", "-c", "feat/demo"], { cwd });
  const { store, seedMeta, seed } = createLifecycleHarness();
  const primary = await seedMeta("demo", {}, { kind: "active" }, { branches: [{ repository: "repo", ref: "feat/demo", linkedAs: "created", excluded: [] }] });
  const tasks = "# Task List: demo\n\n### `[ ]` **1.1 Increment**\n\n- _Goal:_ Implement.\n";
  await seed(recordReferences["work-item/task-list"](primary.reference.owner), tasks);
  const ctx: TaskVerbContext = { store, cwd, slug: "demo", projectId: async () => "repo", exec, execRaw: createExecaRawGitExec(cwd), baseBranch: "main" };
  const parsed = stripReleaseCommitOptions([ids === undefined ? "--close" : `--close=${ids}`, "-m", "feat: increment"]);
  const input = TaskCloseCommandInputSchema.parse({ ids: parsed.close });
  const reports: unknown[] = [];
  const audit: AuditEntry[] = [];
  const interaction = resolveProcessInteractionContext({ noInput: true, machineReadable: false, yes: "absent" });
  const deps: ReleaseCommitDeps = { cwd, identity: "test-user", currentBranch: "feat/demo", argv: parsed.argv,
    settings: { settings: Object.fromEntries(ARC_CONFIG_FIELDS.map((field) => [field.key, field.defaultValue])) as ConfigSettings,
      resolved: { commitInterlock: { value: "on-task-approval", source: "git-config" }, pushInterlock: { value: "manual", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" }, notesPush: { value: "on-sync", source: "default" }, releaseOptedIn: { value: "true", source: "git-config" } }, defaultsApplied: [], warnings: [] },
    spawnGit: createSpawnGit(interaction, false), resolveHead: async () => (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout,
    listRemoteRefsContainingHead: createRemoteRefsContainingHead(exec),
    preflightCommitMessage: async () => ({ kind: "pass-through" }), createMessageSnapshot: () => { throw new Error("no file input"); },
    persistMessageRetry: () => { throw new Error("no Git failure"); }, cleanupConsumedMessageRetry: async () => false, preflightRemedy: "correct message",
    writeStderr: () => {}, appendAudit: async ({ entry }) => { audit.push(AuditEntrySchema.parse(entry)); return { ok: true }; },
    taskClose: createTaskCloseOperations(input.ids, async () => ctx, (result) => reports.push(result)),
  };
  const prepare = async (text: string) => { await writeFile(join(cwd, "work.txt"), text); await exec("git", ["add", "."], { cwd }); };
  const captured = async () => lifecycleSuccess(await store.read({ reference: primary.reference })).links?.taskCaptures;
  return { deps, ctx, store, primary, reports, audit, exec, prepare, captured };
}
it("--close commits and captures the cursor's increment", async () => {
  const h = await fixture(); await h.prepare("increment\n");
  expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 0 });
  const head = (await h.exec("git", ["rev-parse", "HEAD"], { cwd })).stdout;
  expect((await h.captured())?.["1.1"]?.map((commit) => commit.sha)).toEqual([head]);
  expect(h.reports).toMatchObject([{ status: "closed", ids: ["1.1"], captured: [head] }]);
});
it("a split increment's close captures every commit", async () => {
  const h = await fixture("1.1"); await h.prepare("part one\n"); await h.exec("git", ["commit", "-m", "part one"], { cwd });
  const first = (await h.exec("git", ["rev-parse", "HEAD"], { cwd })).stdout;
  await h.prepare("part two\n"); expect((await runReleaseCommit(h.deps)).exitCode).toBe(0);
  expect((await h.captured())?.["1.1"]?.map((commit) => commit.sha)).toEqual(expect.arrayContaining([first, (await h.exec("git", ["rev-parse", "HEAD"], { cwd })).stdout]));
});
it("the wrapper's real unknown-ID precheck audits code17 and leaves HEAD unchanged", async () => {
  const h = await fixture("9.9"); await h.prepare("increment\n"); const before = await h.exec("git", ["rev-parse", "HEAD"], { cwd });
  expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 17 });
  expect(await h.exec("git", ["rev-parse", "HEAD"], { cwd })).toEqual(before);
  expect(h.audit).toMatchObject([{ decision: "refused", refusalCode: 17, outcome: { kind: "close-precheck-failed", check: "task-invalid" } }]);
});
it("a failed postcommit close keeps the commit and its standalone rerun captures it", async () => {
  const h = await fixture(); await h.prepare("increment\n"); const normalSpawn = h.deps.spawnGit;
  h.deps.spawnGit = async (options) => {
    const result = await normalSpawn(options);
    const prior = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: prior.reference, expected: prior.version,
      content: writeMetaPause(prior.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Concurrent pause", waitsOn: null, open: false, resumeNotes: null }),
      placement: { kind: "active" }, provenance: { verb: "pause", lifecycleAction: "pause" } }));
    return result;
  };
  const result = await runReleaseCommit(h.deps);
  expect(result).toMatchObject({ exitCode: 1, committed: expect.any(String), continuation: { argv: ["arc", "task", "close", "1.1"] } });
  expect(await h.captured()).toBeUndefined();
  const paused = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: paused.reference, expected: paused.version, content: writeMetaPause(paused.content, null),
    placement: { kind: "active" }, provenance: { verb: "resume", lifecycleAction: "resume" } }));
  expect(await runTaskClose(h.ctx, { ids: ["1.1"] })).toMatchObject({ status: "closed", captured: [result.committed] });
});
it.each(["paused", "base", "unsupported", "no-open-task", "no-link-planning", "no-link-active", "detached", "unlinked"])("the real %s precheck audits without committing", async (condition) => {
  const h = await fixture(); await h.prepare("increment\n");
  if (condition === "base") await h.exec("git", ["branch", "-D", "main"], { cwd });
  else if (condition === "detached") { await h.exec("git", ["switch", "--detach"], { cwd }); h.deps.currentBranch = ""; }
  else if (condition === "unlinked") { await h.exec("git", ["switch", "-c", "other"], { cwd }); h.deps.currentBranch = "other"; }
  else if (condition === "unsupported") h.ctx.store = { ...h.ctx.store!, capabilities: { stateOffBranch: false } };
  else if (condition === "no-open-task") {
    const prior = lifecycleSuccess(await h.store.read({ reference: recordReferences["work-item/task-list"](h.primary.reference.owner) }));
    lifecycleSuccess(await h.store.write({ action: "put", reference: prior.reference, expected: prior.version, content: prior.content.replace("`[ ]`", "`[x]`"),
      provenance: { verb: "seed-close", lifecycleAction: "close" } }));
  } else {
    const prior = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
    const content = condition === "paused" ? writeMetaPause(prior.content, { pausedBy: SlugSchema.parse("test-user"), since: "2026-10-14T00:00:00Z", reason: "Waiting", waitsOn: null, open: false, resumeNotes: null })
      : condition === "no-link-planning" ? writeMetaCurrentWorkflow(writeMetaState(prior.content, "Planning"), "draft-design") : prior.content;
    lifecycleSuccess(await h.store.write({ action: "put", reference: prior.reference, expected: prior.version, content, placement: { kind: "active" },
      links: condition.startsWith("no-link") ? {} : prior.links, provenance: { verb: "seed-condition", lifecycleAction: "set" } }));
  }
  const before = await h.exec("git", ["rev-parse", "HEAD"], { cwd });
  expect(await runReleaseCommit(h.deps)).toEqual({ exitCode: 17 });
  expect(await h.exec("git", ["rev-parse", "HEAD"], { cwd })).toEqual(before);
  const check = condition === "base" ? "base-unavailable" : condition === "no-open-task" ? "task-invalid"
    : ["detached", "unlinked", "no-link-planning", "no-link-active"].includes(condition) ? "branch-unlinked" : condition;
  expect(h.audit).toMatchObject([{ decision: "refused", refusalCode: 17, outcome: { kind: "close-precheck-failed", check } }]);
});
it("the close reuses its precommit bounded base refresh", async () => {
  const h = await fixture();
  const remote = join(cwd, "origin.git"); await execFileAsync("git", ["clone", "--bare", cwd, remote]);
  await h.exec("git", ["remote", "add", "origin", remote], { cwd });
  const underlying = h.ctx.exec; let fetched = 0;
  h.ctx.exec = async (command, args, options) => { if (command === "git" && args[0] === "fetch") fetched += 1; return underlying(command, args, options); };
  await h.prepare("increment\n"); expect((await runReleaseCommit(h.deps)).exitCode).toBe(0);
  expect((await h.captured())?.["1.1"]).toHaveLength(1);
  expect(fetched).toBe(1);
});
