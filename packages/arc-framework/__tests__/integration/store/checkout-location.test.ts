/** Where a store's Git calls run once the checkout it opened in is removed, over real temporary repositories. */

import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, expect, it } from "vitest";

import { createStoreCheckoutLocation } from "../../../src/lib/store/checkout-location.js";
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
  const location = locate(linked);
  expect(await location.workingDirectory(linked)).toBe(linked);
  const found = await location.gitDirectories();
  expect(found.commonDir).toBe(join(repo, ".git"));

  await git(repo, ["worktree", "remove", linked]);

  expect(await location.workingDirectory(linked)).toBe(repo);
  expect(await location.workingDirectory(join(linked, "nested"))).toBe(repo);
  expect(await location.workingDirectory(root)).toBe(root);
  expect(await location.gitDirectories()).toEqual(found);
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

it("reads the repository again after a lookup that failed, rather than keeping the failure", async () => {
  const location = locate(linked);
  await expect(location.gitDirectories()).rejects.toMatchObject({ code: "ENOENT" });

  await git(repo, ["worktree", "add", "-b", "feat/linked", linked, "main"]);

  expect((await location.gitDirectories()).commonDir).toBe(join(repo, ".git"));
});
