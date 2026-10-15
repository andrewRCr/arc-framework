/** Published reachability uses refreshed named refs and treats deleted refs as absent. */
import { afterEach, expect, it } from "vitest";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { HandoverCommandInputSchema, PauseCommandInputSchema } from "../../src/handlers/lifecycle-collaboration.js";
import { ParsedMetaRecordSchema } from "../../src/lib/active/meta-schema.js";
import { readUnsharedWork } from "../../src/lib/work-unit/verbs/unshared-work.js";
import { runHandover, runPause } from "../../src/lib/work-unit/verbs/pause-handover.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import type { LocusPorts } from "../../src/lib/work-unit/locus-ports.js";
const roots: string[] = [];
const HANDOVER_TIMEOUT_MS = 30_000;
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });
async function fixture(origin = true, planning = false) {
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
  const record = await harness.seedMeta("example", planning ? { state: "Planning", currentWorkflow: "draft-design" } : {}, undefined,
    { branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const locusPorts: LocusPorts = { checkMarkerExclusivity: async () => ({ kind: "clear" }), findHoldingCheckout: async () => root,
    writeAnchoredMarker: async () => ({ kind: "unadmitted" }) };
  return { root, exec, sha, record, ...harness, context: { cwd: root, identity: "test-user", exec, baseBranch: "main", repository: "repo", locusPorts, store: harness.store } };
}
it.each([false, true])("checks recorded work independently of the holder branch before handover, origin=%s", async (origin) => {
  const f = await fixture(origin, true); await f.exec("git", origin ? ["switch", "--detach", "main"] : ["switch", "main"]);
  const head = (await f.exec("git", ["rev-parse", "HEAD"])).stdout;
  const input = HandoverCommandInputSchema.parse({ slug: "example", to: "another-user" });
  const params = { name: input.slug!, to: input.to };
  await writeFile(join(f.root, "pending.txt"), "uncommitted\n");
  expect(await runHandover(f.context, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("pending.txt") });
  expect(lifecycleSuccess(await f.store.read({ reference: f.record.reference }))).toEqual(f.record);
  await rm(join(f.root, "pending.txt"));
  if (origin) {
    expect(await runHandover(f.context, params)).toMatchObject({ status: "rejected", remedy: { argv: ["git", "push", "-u", "origin", "feat/example"] } });
    expect(lifecycleSuccess(await f.store.read({ reference: f.record.reference }))).toEqual(f.record);
    await f.exec("git", ["push", "origin", "feat/example"]);
  }
  expect(await runHandover(f.context, params)).toMatchObject({ status: "handed-over", owner: "another-user",
    report: { kind: "observed", branch: "feat/example", changedPaths: [], unsharedCommits: [], heldOnlyCommits: origin ? [] : [f.sha] } });
  const handedOver = lifecycleSuccess(await f.store.read({ reference: f.record.reference }));
  expect(handedOver.fields).toEqual({ ...ParsedMetaRecordSchema.parse(f.record.fields), owner: "another-user" });
  expect(handedOver.links).toEqual(f.record.links); expect(handedOver.placement).toEqual(f.record.placement);
  expect((await f.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(head);
  const branch = await f.exec("git", ["symbolic-ref", "--quiet", "HEAD"]).then((result) => result.stdout.trim(), () => null);
  expect(branch).toBe(origin ? null : "refs/heads/main");
}, HANDOVER_TIMEOUT_MS);
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

it("finds the selected repository's dirty holder when the executor defaults to a nested repository", async () => {
  const f = await fixture(false);
  await writeWorktreeOwnershipMarker(f.root, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user" });
  await f.exec("git", ["add", "-A"]); await f.exec("git", ["commit", "--allow-empty", "-m", "holder marker"]);
  const nested = join(f.root, ".git", "nested"); await mkdir(nested);
  await f.exec("git", ["init", "-b", "main", nested]);
  const ctx = { ...f.context, locusPorts: undefined, exec: makeGitExec(nested) };
  await writeFile(join(f.root, "pending.txt"), "preserve this work\n");
  const input = HandoverCommandInputSchema.parse({ slug: "example", to: "another-user" });
  const params = { name: input.slug!, to: input.to };
  expect(await runHandover(ctx, params)).toMatchObject({ status: "rejected", reason: expect.stringContaining("pending.txt") });
  expect(lifecycleSuccess(await f.store.read({ reference: f.record.reference }))).toEqual(f.record);
  await rm(join(f.root, "pending.txt"));
  expect(await runHandover(ctx, params)).toMatchObject({ status: "handed-over", owner: "another-user" });
});


it("reports and refuses unpublished promoted work while the holder stays on its published Errand branch", async () => {
  const f = await fixture();
  await f.exec("git", ["switch", "-c", "chore/example", "main"]);
  await writeWorktreeOwnershipMarker(f.root, { createdByArc: true, createdFor: { kind: "work-unit", name: "example" }, spawningIdentity: "test-user" });
  await f.exec("git", ["add", "-A"]); await f.exec("git", ["commit", "--allow-empty", "-m", "holder marker"]);
  await f.exec("git", ["push", "origin", "chore/example"]);
  lifecycleSuccess(await f.store.write({ action: "put", reference: f.record.reference, expected: f.record.version,
    content: f.record.content, placement: { kind: "active" }, links: { branches: [
      { repository: "repo", ref: "chore/example", linkedAs: "created", excluded: [] }, ...f.record.links!.branches!], },
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const ctx = { ...f.context, locusPorts: undefined };
  const pause = PauseCommandInputSchema.parse({ slug: "example", reason: "Review" });
  expect(await runPause(ctx, { name: pause.slug!, identity: "test-user", reason: pause.reason })).toMatchObject({ status: "paused",
    report: { kind: "observed", branch: "feat/example", unsharedCommits: [f.sha] } });
  const paused = lifecycleSuccess(await f.store.read({ reference: f.record.reference }));
  const input = HandoverCommandInputSchema.parse({ slug: "example", to: "another-user" });
  const params = { name: input.slug!, to: input.to };
  expect(await runHandover(ctx, params)).toMatchObject({ status: "rejected", remedy: { argv: ["git", "push", "-u", "origin", "feat/example"] } });
  expect(lifecycleSuccess(await f.store.read({ reference: f.record.reference }))).toEqual(paused);
  await f.exec("git", ["push", "origin", "feat/example"]);
  expect(await runHandover(ctx, params)).toMatchObject({ status: "handed-over", owner: "another-user", report: { branch: "feat/example" } });
  expect((await f.exec("git", ["symbolic-ref", "--short", "HEAD"])).stdout.trim()).toBe("chore/example");
}, HANDOVER_TIMEOUT_MS);
