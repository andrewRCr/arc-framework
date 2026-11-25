/** Where a store's Git calls run once the checkout it opened in is removed, over real temporary repositories. */

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createStoreCheckoutLocation } from "../../../src/lib/store/checkout-location.js";
import { createDefaultRefStorePorts } from "../../../src/lib/store/default-ports.js";
import { createDefaultStorePorts, layerStoreFiles } from "../../../src/lib/store/default-store-ports.js";
import { createExecaGitExec } from "../../../src/lib/git/process-executor.js";

const run = promisify(execFile);
const git = async (cwd: string, args: string[]) =>
  (await run("git", ["-c", "user.name=Test", "-c", "user.email=test@example.test", ...args], { cwd })).stdout.trim();
const files = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };

let root: string, repo: string, linked: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "arc-checkout-location-")));
  repo = join(root, "repo"); linked = join(root, "linked");
  await mkdir(repo);
  await git(repo, ["init", "--initial-branch=main"]);
  await git(repo, ["commit", "--allow-empty", "-m", "initial"]);
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

function locate(checkoutRoot: string) {
  return createStoreCheckoutLocation({ checkoutRoot, fs: files, exec: createExecaGitExec() });
}

it("runs Git in the checkout while it remains, and in the primary checkout once it is removed", async () => {
  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);
  const child = join(linked, "..cache");
  const sibling = join(root, "linked-other");
  await mkdir(child);
  await mkdir(sibling);
  const location = locate(linked);
  expect(await location.workingDirectory(linked)).toBe(linked);
  const found = await location.gitDirectories();
  expect(found.commonDir).toBe(join(repo, ".git"));

  await git(repo, ["worktree", "remove", linked]);

  expect(await location.workingDirectory(linked)).toBe(repo);
  expect(await location.workingDirectory(join(linked, "nested"))).toBe(repo);
  expect(await location.workingDirectory(root)).toBe(root);
  expect(await location.gitDirectories()).toEqual(found);
  expect(await location.workingDirectory(sibling)).toBe(sibling);
  expect(await location.workingDirectory(child)).toBe(repo);
});

it("returns the native primary path when only the Git directories were read before removal", async () => {
  await git(repo, ["worktree", "add", "--detach", linked]);
  const location = locate(linked);
  await location.gitDirectories();
  await git(repo, ["worktree", "remove", linked]);

  expect(await location.workingDirectory(linked)).toBe(repo);
});

it.each([false, true])("runs Git from the primary when only the folder remains (gitfile retained: %s)", async retainGitfile => {
  await git(repo, ["worktree", "add", "--detach", linked]);
  const location = locate(linked);
  const gitfilePath = join(linked, ".git");
  const gitfile = await readFile(gitfilePath, "utf8");
  await location.gitDirectories();
  await git(repo, ["worktree", "remove", linked]);
  await mkdir(linked);
  if (retainGitfile) await writeFile(gitfilePath, gitfile);

  expect(await location.workingDirectory(linked)).toBe(repo);
  expect(await location.workingDirectory(join(linked, "nested"))).toBe(repo);
});

it("leaves a call where it was meant to run when the checkout went before any Git call found the repository", async () => {
  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);
  const location = locate(linked);
  await git(repo, ["worktree", "remove", linked]);

  expect(await location.workingDirectory(linked)).toBe(linked);
  await expect(location.gitDirectories()).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports a checkout access error and reads the linked worktree's config again once access returns", async () => {
  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);
  await git(repo, ["config", "extensions.worktreeConfig", "true"]);
  await git(repo, ["config", "--worktree", "test.checkout", "primary"]);
  await git(linked, ["config", "--worktree", "test.checkout", "linked"]);
  const inspect = vi.fn((path: string) => lstat(path));
  const ports = createDefaultStorePorts({ checkoutRoot: linked, fs: { ...layerStoreFiles(), lstat: inspect } });
  const readSetting = async () => (await ports.exec("git", ["config", "--get", "test.checkout"])).stdout;
  expect(await readSetting()).toBe("linked");

  const error = Object.assign(new Error("Permission denied"), { code: "EACCES", path: join(linked, ".git") });
  inspect.mockRejectedValueOnce(error);
  await expect.soft(readSetting()).rejects.toBe(error);
  expect(await readSetting()).toBe("linked");
});

it("reports a failed primary lookup and retries it once the Git config is repaired", async () => {
  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);
  const ports = createDefaultStorePorts({ checkoutRoot: linked });
  await ports.gitDirectories();
  await git(repo, ["worktree", "remove", linked]);
  const configPath = join(repo, ".git", "config");
  const config = await readFile(configPath, "utf8");
  await writeFile(configPath, "[invalid\n");

  await expect.soft(ports.exec("git", ["rev-parse", "HEAD"])).rejects.toMatchObject({
    kind: "nonzero-exit", stderr: expect.stringMatching(/bad config/iu),
  });
  await writeFile(configPath, config);
  expect((await ports.exec("git", ["rev-parse", "HEAD"])).stdout).toBe(await git(repo, ["rev-parse", "HEAD"]));
});

it.each(["replacement repository", "dangling symlink"])(
  "keeps Git and its ref lock in the opening repository with a %s at the old path", async (remnant) => {
    await git(repo, ["worktree", "add", "--detach", linked, "main"]);
    const checkoutRoot = remnant === "dangling symlink" ? join(root, "alias") : linked;
    if (checkoutRoot !== linked) await symlink(linked, checkoutRoot, "junction");
    const ports = createDefaultRefStorePorts({ checkoutRoot, backingRepository: async () => null });
    const commonDir = join(repo, ".git");
    const gitCommonDir = async () => {
      const { stdout } = await ports.exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: checkoutRoot });
      return realpath(stdout);
    };
    expect(await gitCommonDir()).toBe(commonDir);

    if (remnant === "replacement repository") {
      // Moving the checkout frees its old path while keeping its original Git metadata.
      await git(repo, ["worktree", "move", linked, join(root, "moved")]);
      await mkdir(linked);
      await git(linked, ["init", "--initial-branch=main"]);
    } else {
      await git(repo, ["worktree", "remove", linked]);
    }

    const ref = "refs/arc/test";
    const release = await ports.lock(ref);
    try {
      expect((await lstat(join(commonDir, "arc", "locks", `${ref}.lock`))).isFile()).toBe(true);
      await expect(gitCommonDir()).resolves.toBe(commonDir);
    } finally {
      await release();
    }
  },
);

it("reads the repository again after a lookup that failed, rather than keeping the failure", async () => {
  const location = locate(linked);
  await expect(location.gitDirectories()).rejects.toMatchObject({ code: "ENOENT" });

  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);

  expect((await location.gitDirectories()).commonDir).toBe(join(repo, ".git"));
});
