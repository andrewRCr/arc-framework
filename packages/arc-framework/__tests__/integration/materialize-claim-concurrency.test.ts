/** Real checkout claims remain exclusive under concurrent branchless materialization. */
import { basename, dirname, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess as ok } from "../helpers/store/lifecycle-harness.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { runMaterialize } from "../../src/lib/work-unit/verbs/materialize.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { writeMetaPause } from "../../src/lib/store/kinds/meta/writers.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { runLocusRelease } from "../../src/lib/locus/release.js";

it("admits one of two concurrent claims and permits the loser after release", async () => {
  const cwd = await createTempRepo(), exec = makeGitExec(cwd), h = createLifecycleHarness();
  onTestFinished(() => cleanupTempDir(cwd));
  await exec("git", ["commit", "--allow-empty", "-m", "Initialize claim fixture"]);
  const primary = await h.seedMeta("same", { state: "Planning", owner: "alice", currentWorkflow: "draft-design" });
  const roots = [join(dirname(cwd), `${basename(cwd)}-one`), join(dirname(cwd), `${basename(cwd)}-two`)];
  onTestFinished(async () => { for (const root of roots) await cleanupTempDir(root); });
  for (const root of roots) await exec("git", ["worktree", "add", "--detach", root, "main"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout;
  const contexts = roots.map(root => buildExecutorContext({ cwd: root, store: h.store, projectId: async () => "project", identity: "alice", teamMode: false,
    internalTemplateDir: "/unused", io: { ...createUserIOContext(), exec: makeGitExec(root) } }));
  const input = { name: "same", inPlace: true as const, identity: "alice", spawningIdentity: "alice", baseBranch: "main" };
  const results = await Promise.all(contexts.map(async context => {
    try { return await runMaterialize(context, input); }
    catch (error) { return { status: "rejected", reason: error instanceof Error ? error.message : String(error) }; }
  }));
  const winner = results.findIndex(result => result.status === "materialized"), loser = 1 - winner;
  expect(results.filter(result => result.status === "materialized")).toHaveLength(1);
  expect(results[loser]).toMatchObject({ status: "rejected", reason: expect.stringContaining(roots[winner]!) });
  expect(await readWorktreeMarker(roots[winner]!)).toMatchObject({ kind: "present", marker: { createdFor: { name: "same" } } });
  expect(await readWorktreeMarker(roots[loser]!)).toMatchObject({ kind: "absent" });
  expect(ok(await h.store.read({ reference: primary.reference }))).toEqual(primary);
  for (const root of roots) expect((await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout).toBe(head);
  ok(await h.store.write({ ...recordPut(primary, { content: writeMetaPause(primary.content, { pausedBy: SlugSchema.parse("alice"), since: "2026-10-19T00:00:00Z", reason: "handover", waitsOn: null, resumeNotes: null, open: false }) }), provenance: { verb: "pause", lifecycleAction: "pause" } }));
  expect(await runLocusRelease({ cwd, exec, store: h.store, identity: "alice", baseBranch: "main" }, "same")).toMatchObject({ status: "released" });
  expect(await runMaterialize(contexts[loser]!, input)).toMatchObject({ status: "materialized", worktreePath: roots[loser] });
}, 30_000);
