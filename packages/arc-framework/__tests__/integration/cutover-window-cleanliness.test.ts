/** Quiescence observes physical checkout changes even when ordinary Git status configuration hides untracked files. */
import { writeFile, rm, mkdir, appendFile, rename, symlink } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture, mergeMainIntoFixtureFlip } from "../helpers/cutover-window/check.js";

it("refuses an untracked checkout file despite a configuration that hides it and passes after removal", async () => {
  const h = await windowFixture();
  await h.git("git", ["config", "status.showUntrackedFiles", "no"]);
  const path = join(h.root, "unfinished.txt");
  await writeFile(path, "Uncommitted work must reach a task boundary.\n");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(h.root), condition: expect.stringContaining("dirty"),
      remedy: expect.stringContaining("commit") }),
  ]) } });
  expect(refused.report).toContain("main");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await rm(path);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it.each(["ahead", "behind", "detached", "without an upstream"] as const)(
  "refuses a checkout that is %s and passes after its upstream boundary is restored", async state => {
    const h = await windowFixture();
    let repair: () => Promise<unknown>;
    if (state === "ahead") {
      await h.git("git", ["commit", "--allow-empty", "-m", "Unpublished local work"]);
      repair = () => h.git("git", ["push", "origin", "main"]);
    } else if (state === "behind") {
      const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
      const tree = (await h.git("git", ["rev-parse", "HEAD^{tree}"])).stdout.trim();
      const next = (await h.git("git", ["commit-tree", tree, "-p", head, "-m", "Fetched remote advance"])).stdout.trim();
      await h.git("git", ["push", "origin", `${next}:refs/heads/main`]);
      await h.git("git", ["fetch", "origin", "main"]);
      repair = () => h.git("git", ["merge", "--ff-only", "origin/main"]);
    } else if (state === "detached") {
      const child = join(h.root, ".arc-fixture/detached-alpha");
      await h.git("git", ["worktree", "add", child, "feat/alpha"]); await h.git("git", ["worktree", "lock", child]);
      await writeWorktreeMarker(child, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: "2026-01-01T00:00:00.000Z",
        createdFor: { kind: "work-unit", name: "alpha" } });
      await h.git("git", ["checkout", "--detach"], { cwd: child });
      repair = () => h.git("git", ["checkout", "feat/alpha"], { cwd: child });
    } else {
      await h.git("git", ["branch", "--unset-upstream", "main"]);
      repair = () => h.git("git", ["branch", "--set-upstream-to=origin/main", "main"]);
    }
    const head = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    const fetched = (await h.git("git", ["rev-parse", "refs/remotes/origin/main"])).stdout.trim();
    const refused = await checkFixture(h);
    expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
      expect.objectContaining({ subject: expect.stringContaining(h.root), condition: expect.stringContaining(state),
        remedy: expect.stringContaining("retry check") }),
    ]) } });
    expect((await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(head);
    expect((await h.git("git", ["rev-parse", "refs/remotes/origin/main"])).stdout.trim()).toBe(fetched);
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
    await repair();
    if (state === "ahead" || state === "behind") await mergeMainIntoFixtureFlip(h);
    const repaired = await checkFixture(h);
    expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
  }, 30_000,
);

it.each([
  ".arc/active/temp-alpha.md",
  ".arc/backlog/temp-unrecorded.md",
  ".arc/completed/temp-unrecorded.md",
  ".arc/system/.internal/candidates/temp-source.md",
  ".arc/system/.internal/transitions/temp-source.md",
])("refuses an ignored tracked-state file at %s and passes after it is moved out", async relativePath => {
  const h = await windowFixture();
  const path = join(h.root, relativePath);
  const exclude = resolve(h.root, (await h.git("git", ["rev-parse", "--git-path", "info/exclude"])).stdout.trim());
  await appendFile(exclude, `${relativePath}\n`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "# Ignored source\n\nThe import's disk discovery can read this file.\n");
  expect((await h.git("git", ["status", "--porcelain", "--untracked-files=all"])).stdout.trim()).toBe("");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(h.root), condition: expect.stringContaining("ignored"),
      remedy: expect.stringContaining("Move") }),
  ]) } });
  expect(refused.report).toContain(relativePath);
  await rm(path);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it.each(["identity root", "direct", "nested"] as const)("refuses a personal link at %s and passes after the link is removed", async location => {
  const h = await windowFixture();
  const personal = join(h.root, ".arc/user/andrew");
  const target = join(h.root, ".arc-fixture/link-target");
  const link = location === "identity root" ? personal : join(personal, location === "nested" ? "nested/link" : "link");
  if (location === "identity root") await rename(personal, target);
  else {
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "memo.md"), "Personal content behind the link.\n");
    await mkdir(dirname(link), { recursive: true });
  }
  await symlink(target, link, "junction");
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining(h.root), condition: expect.stringContaining("personal link"),
      remedy: expect.stringContaining("Replace") }),
  ]) } });
  expect(refused.report).toContain(link);
  await rm(link);
  if (location === "identity root") await rename(target, personal);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
