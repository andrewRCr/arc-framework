/** Published reachability uses refreshed named refs and treats deleted refs as absent. */
import { afterEach, expect, it } from "vitest";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { readUnsharedWork } from "../../src/lib/work-unit/verbs/unshared-work.js";
import { runHandover, runPause } from "../../src/lib/work-unit/verbs/pause-handover.js";
import type { LocusPorts } from "../../src/lib/work-unit/locus-ports.js";
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });
async function fixture(origin = true) {
  const root = await createTempRepoCore({ prefix: "arc-unshared-", identity: "test-user" }); roots.push(root);
  const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  if (origin) {
    const remote = join(root, ".git", "remote.git"); await mkdir(remote); await exec("git", ["init", "--bare", remote]);
    await exec("git", ["remote", "add", "origin", remote]); await exec("git", ["push", "origin", "main"]);
  }
  await exec("git", ["switch", "-c", "feat/example"]);
  await writeFile(join(root, "work.txt"), "work\n"); await exec("git", ["add", "work.txt"]); await exec("git", ["commit", "-m", "work"]);
  const sha = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const harness = createLifecycleHarness();
  const record = await harness.seedMeta("example", {}, undefined, { branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => root,
    writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  return { root, exec, sha, record, ...harness, context: { cwd: root, exec, baseBranch: "main", repository: "repo", locusPorts, store: harness.store } };
}
it("reports never-pushed work and pause still succeeds while handover refuses with push action", async () => {
  const f = await fixture();
  expect(await readUnsharedWork(f.context, f.record)).toMatchObject({ kind: "observed", origin: "refreshed", unsharedCommits: [f.sha], changedPaths: [] });
  expect(await runPause(f.context, { name: "example", identity: "test-user", reason: "Review." })).toMatchObject({ status: "paused", report: { unsharedCommits: [f.sha] } });
  expect(await runHandover(f.context, { name: "example", to: "another-user" })).toMatchObject({ status: "rejected", remedy: { argv: ["git", "push", "-u", "origin", "feat/example"] } });
});
it("excludes a stale tracking ref after a published branch is deleted remotely", async () => {
  const f = await fixture(); await f.exec("git", ["push", "origin", "feat/example"]);
  expect(await readUnsharedWork(f.context, f.record)).toMatchObject({ kind: "observed", unsharedCommits: [] });
  await f.exec("git", ["--git-dir", join(f.root, ".git", "remote.git"), "update-ref", "-d", "refs/heads/feat/example"]);
  expect((await f.exec("git", ["rev-parse", "refs/remotes/origin/feat/example"])).stdout.trim()).toBe(f.sha);
  expect(await readUnsharedWork(f.context, f.record)).toMatchObject({ kind: "observed", origin: "refreshed", unsharedCommits: [f.sha] });
  expect(await runHandover(f.context, { name: "example", to: "another-user" })).toMatchObject({ status: "rejected", remedy: { argv: ["git", "push", "-u", "origin", "feat/example"] } });
});
it("reports offline cached refs but refuses handover until origin can be refreshed", async () => {
  const f = await fixture(); await f.exec("git", ["push", "origin", "feat/example"]);
  await f.exec("git", ["remote", "set-url", "origin", join(f.root, "missing.git")]);
  expect(await readUnsharedWork(f.context, f.record)).toMatchObject({ kind: "observed", origin: "unreachable", unsharedCommits: [] });
  expect(await runPause(f.context, { name: "example", identity: "test-user", reason: "Offline." })).toMatchObject({ status: "paused", report: { origin: "unreachable" } });
  expect(await runHandover(f.context, { name: "example", to: "another-user" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("reachable") });
});
it("no origin has no unshared count, reports held-only work, and admits only a clean handover", async () => {
  const f = await fixture(false);
  expect(await readUnsharedWork(f.context, f.record)).toMatchObject({ kind: "observed", origin: "none", unsharedCommits: [], heldOnlyCommits: [f.sha] });
  await writeFile(join(f.root, "work.txt"), "changed\n");
  expect(await runPause(f.context, { name: "example", identity: "test-user", reason: "Dirty." })).toMatchObject({ status: "paused", report: { changedPaths: ["work.txt"] } });
  expect(await runHandover(f.context, { name: "example", to: "another-user" })).toMatchObject({ status: "rejected", reason: expect.stringContaining("work.txt") });
  await f.exec("git", ["restore", "work.txt"]);
  expect(await runHandover(f.context, { name: "example", to: "another-user" })).toMatchObject({ status: "handed-over", owner: "another-user" });
});
