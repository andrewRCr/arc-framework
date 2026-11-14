/** Native sealing history selects the merge onto main rather than its feature-side commit. */
import { dirname, join, resolve } from "node:path";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { readWindowSealAnchor } from "../../src/scripts/cutover-window/seals.js";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";

it("derives the source-adding merge on main's first-parent history", async () => {
  const h = await windowFixture({ sealed: false });
  const source = "packages/arc-framework/src/scripts/cutover-window/check.ts";
  await h.git("git", ["checkout", "-b", "feat/tooling-seal"]);
  await mkdir(dirname(join(h.root, source)), { recursive: true });
  await writeFile(join(h.root, source), "/** Window check source. */\n");
  await h.git("git", ["add", source]);
  await h.git("git", ["commit", "-m", "Add the window check"]);
  const feature = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  await h.git("git", ["merge", "--no-ff", "feat/tooling-seal", "-m", "Land the window tooling"]);
  const merged = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  expect(merged).not.toBe(feature);
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => ({
    operation: "check", status: "reported", findings: [], data: { anchor: await readWindowSealAnchor({ repo, exec: h.git }) },
  }) }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  expect({ exit, result: JSON.parse(stdout.join("")) as unknown }, stderr.join(""))
    .toMatchObject({ exit: 0, result: { data: { anchor: merged } } });
}, 30_000);

it("refuses a checkout older than the sealing anchor and passes once main is merged into it", async () => {
  const h = await windowFixture({ sealed: false });
  const source = "packages/arc-framework/src/scripts/cutover-window/check.ts";
  await mkdir(dirname(join(h.root, source)), { recursive: true });
  await writeFile(join(h.root, source), "/** Sealed window source. */\n");
  await h.git("git", ["add", source]);
  await h.git("git", ["commit", "-m", "Land the sealing boundary"]);
  await h.git("git", ["push", "origin", "main"]);
  await mergeMainIntoFixtureFlip(h);
  const child = join(h.root, ".arc-fixture/preseal-alpha");
  await h.git("git", ["worktree", "add", child, "feat/alpha"]); await h.git("git", ["worktree", "lock", child]);
  await writeWorktreeMarker(child, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
    createdFor: { kind: "work-unit", name: "alpha" } });
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: child, condition: expect.stringContaining("does not descend"),
      remedy: expect.stringMatching(/merge main.*build:fast/iu) }),
  ]) } });
  await h.git("git", ["merge", "--no-edit", "main"], { cwd: child });
  await h.git("git", ["push", "origin", "feat/alpha"], { cwd: child });
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a stale built CLI and passes when that checkout has no built CLI", async () => {
  const h = await windowFixture();
  const exclude = resolve(h.root, (await h.git("git", ["rev-parse", "--git-path", "info/exclude"])).stdout.trim());
  await appendFile(exclude, "\npackages/arc-framework/dist/\n");
  const bundle = join(h.root, "packages/arc-framework/dist/cli.js");
  await mkdir(dirname(bundle), { recursive: true });
  await writeFile(bundle, "/** Unqualified built CLI. */\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: bundle, condition: expect.stringMatching(/stale.*built CLI/iu),
      remedy: expect.stringContaining("npm run build:fast") }),
  ]) } });
  await rm(bundle);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("reports an unreadable build path and passes after that obstruction is removed", async () => {
  const h = await windowFixture();
  const exclude = resolve(h.root, (await h.git("git", ["rev-parse", "--git-path", "info/exclude"])).stdout.trim());
  await appendFile(exclude, "\npackages/arc-framework/dist\n");
  const directory = join(h.root, "packages/arc-framework/dist");
  await writeFile(directory, "Not a build directory\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: join(directory, "cli.js"), condition: expect.stringContaining("could not"),
      remedy: expect.stringContaining("retry") }),
  ]) } });
  await rm(directory);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("accepts a supplied anchor to resume a hostless rehearsal without the tooling on main", async () => {
  const h = await windowFixture({ sealed: false });
  const missing = await checkFixture(h);
  expect(missing, missing.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "sealing anchor", remedy: expect.stringContaining("hostless rehearsal") }),
  ]) } });
  const anchor = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const repaired = await checkFixture(h, {}, ["--path", "", "--anchor", anchor.slice(0, 12)]);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("reports an underivable anchor and an incomplete identity snapshot beside the other failing conditions", async () => {
  const h = await windowFixture({ sealed: false });
  const identity = "refs/arc/user/alex/errands";
  await h.git("git", ["push", "origin", `HEAD:${identity}`]);
  await writeFile(join(h.root, "untracked.txt"), "dirty\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "sealing anchor" }),
    expect.objectContaining({ subject: identity, condition: expect.stringContaining("incomplete snapshot") }),
    expect.objectContaining({ subject: `${h.root} (main)`, condition: expect.stringContaining("dirty") }),
  ]) } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await rm(join(h.root, "untracked.txt"));
  await h.git("git", ["push", "origin", `:${identity}`]);
  const anchor = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const repaired = await checkFixture(h, {}, ["--path", "", "--anchor", anchor]);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
