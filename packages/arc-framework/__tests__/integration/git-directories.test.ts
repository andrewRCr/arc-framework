import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { mkdtemp, lstat, readFile, realpath, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readGitDirectories } from "../../src/lib/git/directories.js";
import { resolveGitCommonDir, resolveCheckoutGitDir } from "../../src/lib/git/exec.js";
import { makeGitExec } from "../helpers/integration.js";

const roots: string[] = [];
const files = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };
afterEach(async () => {
  await removeGitBackedDirs(roots.splice(0));
});

describe("Git directory marker compatibility", () => {
  it.skipIf(process.platform === "win32").each(["gitfile", "commondir"])(
    "interprets a symlink-parent pair inside the %s marker as Git does", async kind => {
      const root = await mkdtemp(join(tmpdir(), "arc-git-marker-"));
      roots.push(root);
      const exec = makeGitExec(root), common = join(root, "physical", "common.git"), checkout = join(root, "checkout");
      await mkdir(join(root, "physical"));
      await exec("git", ["init", "--bare", common]);
      await exec("git", [`--git-dir=${common}`, "config", "arc.marker-witness", "physical-common"]);
      await mkdir(checkout);
      if (kind === "gitfile") {
        const child = join(root, "physical", "child");
        await mkdir(child);
        await symlink(child, join(root, "bridge"), "dir");
        await writeFile(join(checkout, ".git"), "gitdir: ../bridge/../common.git\n");
      } else {
        const privateDir = join(root, "private");
        await mkdir(privateDir);
        await mkdir(join(common, "child"));
        await symlink(join(common, "child"), join(privateDir, "bridge"), "dir");
        await writeFile(join(privateDir, "HEAD"), "ref: refs/heads/main\n");
        await writeFile(join(privateDir, "commondir"), "bridge/..\n");
        await writeFile(join(checkout, ".git"), "gitdir: ../private\n");
      }
      expect((await exec("git", ["-C", checkout, "config", "arc.marker-witness"])).stdout.trim()).toBe("physical-common");
      expect((await readGitDirectories(checkout, files)).commonDir).toBe(await resolveGitCommonDir(exec, checkout));
      expect((await readGitDirectories(checkout, files)).commonDir).toBe(common);
    }, 10_000,
  );

  it.skipIf(process.platform === "win32").each(["directory", "gitfile"])(
    "resolves relative commondir through a symlinked %s against Git", async markerKind => {
      const root = await mkdtemp(join(tmpdir(), "arc-git-dir-"));
      roots.push(root);
      const exec = makeGitExec(root);
      await exec("git", ["init"]);
      await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "seed"]);
      const linked = join(root, "linked"), checkout = join(root, "symlinked");
      await exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
      const target = await resolveCheckoutGitDir(exec, linked);
      await mkdir(checkout);
      if (markerKind === "directory") await symlink(target, join(checkout, ".git"), "dir");
      else {
        await symlink(target, join(root, "metadata-link"), "dir");
        await writeFile(join(checkout, ".git"), "gitdir: ../metadata-link\n");
      }
      const expected = await resolveGitCommonDir(exec, checkout);
      expect((await readGitDirectories(checkout, files)).commonDir).toBe(expected);
      expect(expected).toBe(join(root, ".git"));
    }, 10_000,
  );

  it("agrees with Git for a real main checkout and linked worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-git-dir-"));
    roots.push(root);
    const exec = makeGitExec(root);
    await exec("git", ["init"]);
    await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "seed"]);
    const linked = join(root, "linked");
    await exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    for (const checkout of [root, linked]) {
      const expected = { gitDir: await resolveCheckoutGitDir(exec, checkout), commonDir: await resolveGitCommonDir(exec, checkout) };
      expect(await readGitDirectories(checkout, files)).toEqual(expected);
    }
  }, 10_000);
});
