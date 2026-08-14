import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { publishDeliveryRemoteRef } from "../../src/lib/delivery/git-materialization.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("delivery materialization against a bare remote", () => {
  it("creates by exact lease, adopts retry, and refuses a different head", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-materialize-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-remote-"));
    const remote = join(remoteParent, "remote.git");
    roots.push(remoteParent);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
    await writeFile(join(repository, "first.txt"), "first\n", "utf8");
    await execFileAsync("git", ["add", "first.txt"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "first"], { cwd: repository });
    const first = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const ref = "refs/heads/delivery/example/first";
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "published" });
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "adopted" });

    await writeFile(join(repository, "second.txt"), "second\n", "utf8");
    await execFileAsync("git", ["add", "second.txt"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "second"], { cwd: repository });
    const second = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    await expect(publishDeliveryRemoteRef({ exec, remote: "origin", ref, head: second }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
  });
});
