/** Native ownership refusals use the same checkout lifecycle view as status. */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";
import { readStatusCheckoutRoster } from "../../src/handlers/status/checkout-roster.js";
import { resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { retireFixtureErrand } from "../helpers/cutover-window/identity-inputs.js";
import { ordinaryErrand, seedTransients } from "../helpers/store/import-transients.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { runBranchTeardown, runTeardown, type TeardownContext } from "../../src/lib/work-unit/verbs/teardown.js";
import type { LifecycleIndexFs } from "../../src/lib/work-unit/lifecycle-index.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";

it("refuses an unmarked linked checkout and passes after it is removed", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/unmarked");
  await h.git("git", ["worktree", "add", "--detach", path]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringContaining("no-marker"), remedy: expect.stringContaining("git worktree remove") }),
  ]) } });
  await h.git("git", ["worktree", "remove", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a locked unmarked checkout and passes after the named unlock and removal", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/locked");
  await h.git("git", ["worktree", "add", "--detach", path]);
  await h.git("git", ["worktree", "lock", "--reason", "kept by hand", path]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path,
      remedy: `Copy out anything wanted; run git worktree unlock ${JSON.stringify(path)}, then git worktree remove ${JSON.stringify(path)}.` }),
  ]) } });
  await h.git("git", ["worktree", "unlock", path]);
  await h.git("git", ["worktree", "remove", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("exposes the primary fixture's native status role", async () => {
  const h = await windowFixture();
  expect(await readStatusCheckoutRoster({ cwd: h.root, exec: h.git }, "andrew")).toEqual([
    expect.objectContaining({ kind: "free-primary" }),
  ]);
}, 30_000);

it("refuses the primary's unresolved status role and passes after its topology is repaired", async () => {
  const h = await windowFixture();
  await h.git("git", ["checkout", "feat/alpha", "--", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Put active branch ownership on the wrong checkout"]);
  await h.git("git", ["push", "origin", "main"]);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.root, condition: expect.stringMatching(/unresolved-checkout.*alpha/u),
      remedy: expect.stringContaining("Observed checkout topology does not corroborate") }),
  ]) } });
  await h.git("git", ["rm", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Restore the free launchpad"]);
  await h.git("git", ["push", "origin", "main"]);
  await mergeMainIntoFixtureFlip(h);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

/** Land alpha on main, archive it as shipped, and leave its branch in an ARC-spawned checkout. */
async function shippedAlphaCheckout(h: Awaited<ReturnType<typeof windowFixture>>): Promise<string> {
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["rm", "--quiet", ".arc/active/meta-alpha.md"]);
  await h.git("git", ["commit", "-m", "Close alpha's active ownership"]);
  await h.git("git", ["push", "origin", "feat/alpha"]);
  await h.git("git", ["checkout", "main"]);
  await h.git("git", ["merge", "--ff-only", "feat/alpha"]);
  const archived = resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: SlugSchema.parse("alpha"),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3"), sequence: ArchiveSequenceSchema.parse("01") } });
  await mkdir(dirname(join(h.root, archived)), { recursive: true });
  await writeFile(join(h.root, archived), makeMetaFixture("alpha", { state: "Shipped", owner: "andrew", branch: null,
    completed: "2026-10-01", prUrl: "https://example.test/pull/2" }));
  await h.git("git", ["add", archived]);
  await h.git("git", ["commit", "-m", "Archive alpha as shipped"]);
  await h.git("git", ["push", "origin", "main"]);
  await mergeMainIntoFixtureFlip(h);
  const path = join(h.root, ".arc-fixture/alpha");
  await h.git("git", ["worktree", "add", path, "feat/alpha"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  return path;
}

/** Delete the passing check's hold, so the test's later checks start a new window. */
async function releaseFixtureHold(h: Awaited<ReturnType<typeof windowFixture>>): Promise<void> {
  const refs = (await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim().split("\n").filter(Boolean);
  for (const ref of refs) await h.git("git", ["update-ref", "-d", ref]);
}

const indexFs: LifecycleIndexFs = { readdir: path => readdir(path, { withFileTypes: true }), readFile: path => readFile(path, "utf8") };
const teardownContext = (cwd: string, exec: GitExec): TeardownContext => ({ cwd, exec, indexFs, chdir: () => undefined,
  readBlob: (ref, path) => readGitBlobBytes(cwd, ref, path) });
const teardownAlpha = { subject: { kind: "slug", slug: "alpha" }, base: "main", protection: "partial" } as const;
const endedRemedy = "Preserve wanted work, then run arc teardown alpha, then retry check.";

it("refuses a retired work unit's checkout and passes after arc teardown removes it", async () => {
  const h = await windowFixture(), path = await shippedAlphaCheckout(h);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: "Checkout is retired: work-unit alpha.", remedy: endedRemedy }),
  ]) } });
  expect(await runTeardown(teardownContext(h.root, h.git), teardownAlpha)).toMatchObject({ status: "torn-down",
    worktreeRemoved: path, branchDeleted: true });
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a husked checkout left by a self-teardown and passes after arc teardown reaps it", async () => {
  const h = await windowFixture(), path = await shippedAlphaCheckout(h);
  expect(await runTeardown(teardownContext(path, makeGitExec(path)), teardownAlpha)).toMatchObject({ status: "torn-down",
    husk: { stamped: true, outcome: "created" }, worktreeRemoved: null });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: "Checkout carries a husk stamp for work-unit alpha.", remedy: endedRemedy }),
  ]) } });
  expect(await runTeardown(teardownContext(h.root, h.git), teardownAlpha)).toMatchObject({ status: "torn-down",
    husk: { outcome: "already-husked" }, worktreeRemoved: path });
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a branch husk left by a self-teardown and passes after arc teardown --branch reaps it", async () => {
  const h = await windowFixture(), branch = "chore/husk-example", path = join(h.root, ".arc-fixture/husk-example");
  await h.git("git", ["branch", branch]);
  await h.git("git", ["push", "--set-upstream", "origin", branch]);
  await h.git("git", ["worktree", "add", path, branch]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "branch", ref: branch } });
  expect(await runBranchTeardown(teardownContext(path, makeGitExec(path)), { branch, base: "main" })).toMatchObject({
    status: "torn-down", husk: { stamped: true, outcome: "created" }, worktreeRemoved: null });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: `Checkout carries a husk stamp for branch ${branch}.`,
      remedy: `Preserve wanted work, then run arc teardown --branch ${branch}, then retry check.` }),
  ]) } });
  expect(await runBranchTeardown(teardownContext(h.root, h.git), { branch, base: "main" })).toMatchObject({
    status: "torn-down", worktreeRemoved: path });
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses an Errand marker without its exact record and requires retirement after it is restored", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/errand");
  await h.git("git", ["branch", "chore/example"]);
  await h.git("git", ["push", "--set-upstream", "origin", "chore/example"]);
  await h.git("git", ["worktree", "add", path, "chore/example"]);
  await h.git("git", ["worktree", "lock", path]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringMatching(/example.*11111111.*no.*record/u),
      remedy: `Restore the exact holder's local or origin identity record, or preserve wanted work and run git worktree unlock ${JSON.stringify(path)}, then git worktree remove ${JSON.stringify(path)}, then retry check.` }),
  ]) } });
  await h.git("git", ["worktree", "unlock", path]);
  await h.git("git", ["worktree", "remove", path]);
  const removed = await checkFixture(h);
  expect(removed, removed.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  await releaseFixtureHold(h);
  await h.git("git", ["branch", "-d", "chore/example"]);
  const identityTip = await seedTransients(h, [ordinaryErrand]);
  await h.git("git", ["worktree", "add", path, "chore/example"]);
  await h.git("git", ["worktree", "lock", path]);
  await h.git("git", ["branch", "--set-upstream-to=origin/chore/example", "chore/example"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  const restored = await checkFixture(h);
  expect(restored, restored.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "Errand example" }),
  ]) } });
  expect(restored.report).not.toContain("no matching acquired identity record");
  await h.git("git", ["worktree", "unlock", path]); await h.git("git", ["worktree", "remove", path]);
  await retireFixtureErrand(h, identityTip);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("defers an Errand marker's holder to an incomplete identity snapshot, and checks the holder once the snapshot reads", async () => {
  const h = await windowFixture();
  const path = join(h.root, ".arc-fixture/errand"), snapshot = "refs/arc/user/alex/errands";
  await h.git("git", ["branch", "chore/example"]);
  await h.git("git", ["push", "--set-upstream", "origin", "chore/example"]);
  await h.git("git", ["worktree", "add", path, "chore/example"]);
  await writeWorktreeMarker(path, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  await h.git("git", ["update-ref", snapshot, "HEAD"]);
  const incomplete = await checkFixture(h);
  expect(incomplete, incomplete.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: snapshot, condition: expect.stringContaining("incomplete snapshot") }),
  ]) } });
  expect(incomplete.report).not.toContain("no matching acquired identity record");
  await h.git("git", ["update-ref", "-d", snapshot]);
  const unheld = await checkFixture(h);
  expect(unheld, unheld.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: path, condition: expect.stringMatching(/example.*11111111.*no.*record/u) }),
  ]) } });
  await h.git("git", ["worktree", "remove", path]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses an unheld Errand marker on the primary and passes once the marker is deleted", async () => {
  const h = await windowFixture(), marker = resolveWorktreeMarkerPath(h.root);
  await writeWorktreeMarker(h.root, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "errand", slug: "example", claimId: "1".repeat(32) }, provisioning: "ready" });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.root, condition: expect.stringMatching(/example.*11111111.*no.*record/u),
      remedy: `Restore the exact holder's local or origin identity record, or preserve wanted work and delete the checkout's worktree marker ${JSON.stringify(marker)}, then retry check.` }),
  ]) } });
  await rm(marker);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
