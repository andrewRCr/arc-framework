/** Native repository copying must preserve every live pointer while relocating copied registrations. */
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { prepareWindowCopy, type WindowCopyHooks } from "../../src/scripts/cutover-window/copy.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { windowPathContains } from "../../src/scripts/cutover-window/paths.js";
import { assertWindowCopySafety } from "../../src/scripts/cutover-window/copy-safety.js";
import { makeGitExec } from "../helpers/integration.js";

async function snapshot(root: string) {
  const registrations = makeGitExec(root);
  const common = resolve(root, (await registrations("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const directory = join(common, "worktrees"), records: Record<string, string> = {};
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      records[path] = (await readFile(path)).toString("base64");
    }
  }
  return { registrations: (await registrations("git", ["worktree", "list", "--porcelain", "-z"])).stdout,
    configuration: (await readFile(join(common, "config"))).toString("base64"), records };
}

async function runCopy(repo: string, destination: string, hooks: WindowCopyHooks = {}) {
  const stdout: string[] = [];
  const exit = await runWindow(["copy", "--repo", repo, "--destination", destination, "--json"], {
    copy: async request => ({ operation: "copy", status: "reported", findings: [], data: await prepareWindowCopy(request, hooks) }),
  }, { stdout: value => { stdout.push(value); }, stderr: () => undefined });
  return { exit, result: JSON.parse(stdout.join("")) as unknown };
}

it("copies all registered checkouts and a mirror without changing live registrations or gitfiles", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const linked = join(container, "linked"), nested = join(h.root, ".arc-fixture/nested");
  await h.git("git", ["worktree", "add", "--detach", linked]);
  await h.git("git", ["worktree", "add", nested, "feat/alpha"]);
  await h.git("git", ["worktree", "lock", "--reason", "Preserve this source checkout", linked]);
  for (const [root, name] of [[h.root, "primary"], [linked, "linked"], [nested, "nested"]] as const) {
    await mkdir(join(root, ".arc-fixture"), { recursive: true });
    await writeFile(join(root, ".arc-fixture/copy-sentinel.txt"), name);
  }
  const before = await snapshot(h.root), gitfiles = await Promise.all([linked, nested].map(path => readFile(join(path, ".git"), "utf8")));
  const destination = join(container, "copy"), repo = join(destination, "primary"), mirror = join(destination, "mirror.git");
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["copy", "--repo", h.root, "--destination", destination, "--json"], { copy: async request => ({
    operation: "copy", status: "reported", findings: [], data: await prepareWindowCopy(request),
  }) }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  expect(await snapshot(h.root)).toEqual(before);
  expect(await Promise.all([linked, nested].map(path => readFile(join(path, ".git"), "utf8")))).toEqual(gitfiles);
  expect({ exit, result: JSON.parse(stdout.join("")) as unknown }, stderr.join(""))
    .toMatchObject({ exit: 0, result: { data: { destination, repo, mirror } } });
  const copied = await scanRegisteredWorktrees((command, args, options) => h.git(command, args, { ...options, cwd: repo }));
  expect(copied.ok).toBe(true);
  if (!copied.ok) throw new Error(copied.message);
  expect(copied.worktrees).toHaveLength(3);
  const sentinels: string[] = [];
  for (const row of copied.worktrees) {
    expect(await windowPathContains(destination, row.path)).toBe(true);
    sentinels.push(await readFile(join(row.path, ".arc-fixture/copy-sentinel.txt"), "utf8"));
  }
  expect(sentinels.sort()).toEqual(["linked", "nested", "primary"]);
  await expect(lstat(join(repo, ".arc-fixture/nested")), "the nested checkout is copied only as its own registration").rejects
    .toMatchObject({ code: "ENOENT" });
  for (const cwd of [repo, mirror]) {
    const remotes = (await h.git("git", ["remote"], { cwd })).stdout.trim().split("\n").filter(Boolean);
    for (const remote of remotes) for (const args of [["remote", "get-url", "--all", remote], ["remote", "get-url", "--push", "--all", remote]]) {
      expect((await h.git("git", args, { cwd })).stdout.trim().split("\n")).toEqual([mirror]);
    }
  }
  expect((await h.git("git", ["--git-dir", mirror, "rev-parse", "refs/heads/main"])).stdout.trim())
    .toBe((await h.remote("git", ["rev-parse", "refs/heads/main"])).stdout.trim());
}, 60_000);

it("refuses a future destination under a symlink into a live checkout before creating it", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-boundary-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  await symlink(h.root, join(container, "alias"), "dir");
  const destination = join(container, "alias", ".arc-fixture", "..copy");
  const stdout: string[] = [];
  const exit = await runWindow(["copy", "--repo", h.root, "--destination", destination, "--json"], {
    copy: async request => ({ operation: "copy", status: "reported", findings: [], data: await prepareWindowCopy(request) }),
  }, { stdout: value => { stdout.push(value); }, stderr: () => undefined });
  expect({ exit, result: JSON.parse(stdout.join("")) as unknown }).toMatchObject({ exit: 1,
    result: { status: "refused", findings: [{ condition: expect.stringContaining("inside live checkout") }] } });
  await expect(readFile(join(h.root, ".arc-fixture", "..copy", "primary", ".git", "config"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses a checkout registered while the copy runs, leaving its live pointer untouched", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-race-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const late = join(container, "late"), destination = join(container, "copy");
  const refused = await runCopy(h.root, destination, {
    afterCheckouts: async () => { await h.git("git", ["worktree", "add", "--detach", late]); },
  });
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  expect(await readFile(join(late, ".git"), "utf8")).toBe(`gitdir: ${join(common, "worktrees", "late")}\n`);
  expect((await h.git("git", ["rev-parse", "--git-common-dir"], { cwd: late })).stdout.trim()).toBe(common);
  expect(refused).toMatchObject({ exit: 1, result: { status: "refused", findings: [{ subject: late,
    condition: expect.stringContaining("registered while the copy ran"),
    remedy: expect.stringMatching(/^Remove the partial copy at .*copy, which holds no worktree registrations, then repair the condition and retry with a new, absent destination\.$/u) }] } });
  await expect(readdir(join(destination, "primary", ".git", "worktrees"))).rejects.toMatchObject({ code: "ENOENT" });
  await rm(destination, { recursive: true, force: true });
  await h.git("git", ["worktree", "remove", late]);
  expect(await runCopy(h.root, join(container, "retry"))).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses a destination that is a direct child of a live checkout named with two leading dots", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-dots-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const inside = join(h.root, "..copy");
  expect(await runCopy(h.root, inside)).toMatchObject({ exit: 1, result: { status: "refused",
    findings: [{ subject: expect.stringMatching(/\.\.copy$/u), condition: expect.stringContaining("inside live checkout") }] } });
  await expect(readdir(inside)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses every registered checkout with no folder together and copies once their registrations are pruned", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-missing-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const gone = [join(container, "gone-a"), join(container, "gone-b")];
  for (const path of gone) {
    await h.git("git", ["worktree", "add", "--detach", path]);
    await rm(path, { recursive: true, force: true });
  }
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 1, result: { status: "refused",
    findings: gone.map(subject => ({ subject, condition: expect.stringContaining("has no folder"), remedy: expect.stringContaining("new, absent destination") })) } });
  await expect(readdir(join(container, "copy"))).rejects.toMatchObject({ code: "ENOENT" });
  await h.git("git", ["worktree", "prune"]);
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses an existing destination without touching it and copies to a new absent one", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-existing-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const existing = join(container, "existing");
  await mkdir(existing);
  await writeFile(join(existing, "kept.txt"), "kept");
  expect(await runCopy(h.root, existing)).toMatchObject({ exit: 1, result: { status: "refused",
    findings: [{ subject: expect.stringMatching(/existing$/u), condition: expect.stringContaining("Cannot acquire a new copy destination"),
      remedy: "Repair the condition and retry with a new, absent destination." }] } });
  expect(await readdir(existing)).toEqual(["kept.txt"]);
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 0 });
}, 60_000);

it("copies a checkout registered inside the common Git directory once, with its pointer inside the copy", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-common-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const inner = join(common, "arc", "review-gate", "materializations", "inner");
  await h.git("git", ["worktree", "add", "--detach", inner]);
  await writeFile(join(inner, "inner-sentinel.txt"), "inner");
  const destination = join(container, "copy"), repo = join(destination, "primary");
  expect(await runCopy(h.root, destination)).toMatchObject({ exit: 0 });
  expect(await readdir(join(repo, ".git", "arc", "review-gate", "materializations"))).toEqual([]);
  const copied = await scanRegisteredWorktrees((command, args, options) => h.git(command, args, { ...options, cwd: repo }));
  if (!copied.ok) throw new Error(copied.message);
  const holders: string[] = [];
  for (const row of copied.worktrees) {
    if (await readFile(join(row.path, "inner-sentinel.txt"), "utf8").catch(() => null) === "inner") holders.push(row.path);
  }
  expect(holders).toHaveLength(1);
  const pointer = (await readFile(join(holders[0] ?? "", ".git"), "utf8")).trim().slice("gitdir: ".length);
  expect(await windowPathContains(destination, pointer)).toBe(true);
  await expect(assertWindowCopySafety({ destination, repo, mirror: join(destination, "mirror.git") },
    { host: { discoverRepository: async () => null } })).resolves.toBeUndefined();
}, 60_000);

it("refuses linked checkout metadata outside the common Git directory and copies once its pointer is restored", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-metadata-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const linked = join(container, "linked"), outside = join(container, "outside-admin");
  await h.git("git", ["worktree", "add", "--detach", linked]);
  const gitfile = await readFile(join(linked, ".git"), "utf8"), admin = gitfile.trim().slice("gitdir: ".length);
  await cp(admin, outside, { recursive: true });
  await writeFile(join(outside, "commondir"), `${resolve(admin, (await readFile(join(admin, "commondir"), "utf8")).trim())}\n`);
  await writeFile(join(linked, ".git"), `gitdir: ${outside}\n`);
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 1, result: { status: "refused", findings: [{ subject: linked,
    condition: expect.stringContaining("outside the common Git directory"),
    remedy: expect.stringMatching(/^Remove the partial copy at .*copy, which holds no worktree registrations, then repair the condition and retry with a new, absent destination\.$/u) }] } });
  await writeFile(join(linked, ".git"), gitfile);
  expect(await runCopy(h.root, join(container, "retry"))).toMatchObject({ exit: 0 });
}, 60_000);

it("names a stale worktree registration in the live repository and copies once it is pruned", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-stale-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  const stale = join(common, "worktrees", "stale");
  await mkdir(stale, { recursive: true });
  await writeFile(join(stale, "HEAD"), "ref: refs/heads/main\n");
  await writeFile(join(stale, "commondir"), "../..\n");
  expect(await runCopy(h.root, join(container, "copy"))).toMatchObject({ exit: 1, result: { status: "refused", findings: [{ subject: stale,
    condition: expect.stringContaining("no readable gitdir"),
    remedy: expect.stringMatching(/, then run `git worktree prune` in the live repository and retry with a new, absent destination\.$/u) }] } });
  await h.git("git", ["worktree", "prune"]);
  expect(await runCopy(h.root, join(container, "retry"))).toMatchObject({ exit: 0 });
}, 60_000);
