/** Native repository copying must preserve every live pointer while relocating copied registrations. */
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { prepareWindowCopy } from "../../src/scripts/cutover-window/copy.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { windowPathContains } from "../../src/scripts/cutover-window/paths.js";
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
}, 60_000);

it("refuses a checkout registered while the copy runs, leaving its live pointer untouched", async () => {
  const h = await windowFixture(), container = await mkdtemp(join(tmpdir(), "arc-window-copy-race-"));
  onTestFinished(() => rm(container, { recursive: true, force: true }));
  const late = join(container, "late"), destination = join(container, "copy");
  const stdout: string[] = [];
  const exit = await runWindow(["copy", "--repo", h.root, "--destination", destination, "--json"], {
    copy: async request => ({ operation: "copy", status: "reported", findings: [], data: await prepareWindowCopy(request, {
      afterCheckouts: async () => { await h.git("git", ["worktree", "add", "--detach", late]); },
    }) }),
  }, { stdout: value => { stdout.push(value); }, stderr: () => undefined });
  const common = resolve(h.root, (await h.git("git", ["rev-parse", "--git-common-dir"])).stdout.trim());
  expect(await readFile(join(late, ".git"), "utf8")).toBe(`gitdir: ${join(common, "worktrees", "late")}\n`);
  expect((await h.git("git", ["rev-parse", "--git-common-dir"], { cwd: late })).stdout.trim()).toBe(common);
  expect({ exit, result: JSON.parse(stdout.join("")) as unknown }).toMatchObject({ exit: 1, result: { status: "refused",
    findings: [{ subject: late, condition: expect.stringContaining("registered while the copy ran") }] } });
}, 60_000);
