import { chmod, mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSpawnRawGitExec } from "../../src/lib/change-facts.js";
import { readGitBlobBytes } from "../../src/lib/io-context.js";
import { readObjectAvailability } from "../../src/lib/git/object-availability.js";
import type { GitExecInput } from "../../src/lib/git/exec.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execa("git", args, { cwd });
  return result.stdout.trim();
}

async function objectInventory(repository: string): Promise<string[]> {
  return (await readdir(join(repository, ".git", "objects"), { recursive: true })).sort();
}

async function installGitWrapper(root: string, lines: string[]): Promise<void> {
  const wrapperDirectory = join(root, "bin");
  const wrapper = join(wrapperDirectory, "git");
  await mkdir(wrapperDirectory);
  await writeFile(wrapper, ["#!/bin/sh", ...lines, ""].join("\n"), "utf8");
  await chmod(wrapper, 0o755);
  vi.stubEnv("PATH", `${wrapperDirectory}:${process.env.PATH ?? ""}`);
}

describe("local-only object availability", () => {
  it("keeps a missing promisor object absent while reporting a complete negative fact", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-object-availability-"));
    tempDirs.push(root);
    const source = join(root, "source");
    const remote = join(root, "remote.git");
    const clone = join(root, "clone");

    await execa("git", ["init", source]);
    await git(source, ["config", "user.email", "arc@example.invalid"]);
    await git(source, ["config", "user.name", "ARC Test"]);
    await writeFile(join(source, "seed.txt"), "seed\n", "utf8");
    await git(source, ["add", "seed.txt"]);
    await git(source, ["commit", "-m", "seed"]);
    await execa("git", ["init", "--bare", remote]);
    await git(remote, ["config", "uploadpack.allowFilter", "true"]);
    await git(source, ["remote", "add", "origin", remote]);
    await git(source, ["push", "-u", "origin", "HEAD:main"]);
    await execa("git", ["clone", "--filter=blob:none", `file://${remote}`, clone]);

    await writeFile(join(source, "later.txt"), "later\n", "utf8");
    await git(source, ["add", "later.txt"]);
    await git(source, ["commit", "-m", "later"]);
    const missingCommit = await git(source, ["rev-parse", "HEAD"]);
    await git(source, ["push", "origin", "HEAD:main"]);

    const before = await objectInventory(clone);
    const execInput: GitExecInput = async (args, input, options) => {
      if (options?.objectAccess !== "local-only") {
        throw new Error("object inspection did not request local-only access");
      }
      const result = await execa("git", args, {
        cwd: clone,
        env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
        input,
      });
      return result.stdout;
    };

    await expect(readObjectAvailability({
      execInput,
      oids: [missingCommit],
      cwd: clone,
    })).resolves.toEqual({
      kind: "complete",
      commits: { [missingCommit]: false },
    });
    expect(await objectInventory(clone)).toEqual(before);
  });

  it.skipIf(process.platform === "win32")(
    "keeps an omitted tree and blob absent when a byte-preserving read fails locally",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "arc-byte-object-access-"));
      tempDirs.push(root);
      const source = join(root, "source");
      const remote = join(root, "remote.git");
      const clone = join(root, "clone");

      await execa("git", ["init", source]);
      await git(source, ["config", "user.email", "arc@example.invalid"]);
      await git(source, ["config", "user.name", "ARC Test"]);
      await writeFile(join(source, "seed.txt"), "seed\n", "utf8");
      await git(source, ["add", "seed.txt"]);
      await git(source, ["commit", "-m", "seed"]);
      await execa("git", ["init", "--bare", remote]);
      await git(remote, ["config", "uploadpack.allowFilter", "true"]);
      await git(source, ["remote", "add", "origin", remote]);
      await git(source, ["push", "-u", "origin", "HEAD:main"]);
      await execa("git", ["clone", "--filter=tree:0", `file://${remote}`, clone]);

      await writeFile(join(source, "later.txt"), "later\n", "utf8");
      await git(source, ["add", "later.txt"]);
      await git(source, ["commit", "-m", "later"]);
      const presentCommit = await git(source, ["rev-parse", "HEAD"]);
      await git(source, ["push", "origin", "HEAD:main"]);
      await execa("git", ["fetch", "--filter=tree:0", "origin", "main"], { cwd: clone });

      const realGit = (await execa("which", ["git"])).stdout.trim();
      await installGitWrapper(root, [
        "if [ \"$1\" = \"--no-lazy-fetch\" ]; then shift; fi",
        `exec ${JSON.stringify(realGit)} "$@"`,
      ]);

      const before = await objectInventory(clone);
      await expect(readGitBlobBytes(clone, presentCommit, "later.txt", { objectAccess: "local-only" }))
        .rejects.toSatisfy(isGitProcessError);
      expect(await objectInventory(clone)).toEqual(before);

      const materialized = await readGitBlobBytes(clone, presentCommit, "later.txt");
      expect(materialized).not.toBeNull();
      if (materialized === null) throw new Error("Expected the default reader to materialize later.txt.");
      expect(Buffer.from(materialized)).toEqual(Buffer.from("later\n"));
      expect(await objectInventory(clone)).not.toEqual(before);
    },
  );

  it.skipIf(process.platform === "win32")(
    "pairs the local-only option and environment in the spawn-based raw adapter",
    async () => {
      const root = await mkdtemp(join(tmpdir(), "arc-spawn-object-access-"));
      tempDirs.push(root);
      await installGitWrapper(root, [
        "if [ \"$1\" != \"--no-lazy-fetch\" ] || [ \"$GIT_NO_LAZY_FETCH\" != \"1\" ]; then exit 7; fi",
        "printf raw-bytes",
      ]);

      await expect(createSpawnRawGitExec(root)(["cat-file", "blob", "a".repeat(40)], {
        objectAccess: "local-only",
      })).resolves.toMatchObject({ stdout: Buffer.from("raw-bytes") });
    },
  );
});
