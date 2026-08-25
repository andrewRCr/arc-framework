import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  deleteDeliveryRemoteRef,
  publishDeliveryMemberRef,
  publishDeliveryTopRef,
} from "../../src/lib/delivery/git-materialization.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("delivery materialization against a bare remote", () => {
  it("advances the top over ordinary unpublished local progress", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-top-progress-" });
    roots.push(repository);
    const remoteParent = await mkdtemp(join(tmpdir(), "arc-delivery-top-remote-"));
    const remote = join(remoteParent, "remote.git");
    roots.push(remoteParent);
    await execFileAsync("git", ["init", "--bare", remote]);
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repository });
    const commit = async (path: string): Promise<string> => {
      await writeFile(join(repository, path), `${path}\n`, "utf8");
      await execFileAsync("git", ["add", path], { cwd: repository });
      await execFileAsync("git", ["commit", "-m", path], { cwd: repository });
      return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    };
    const remoteHead = await commit("remote.txt");
    const topRef = "refs/heads/feat/example";
    await execFileAsync("git", ["push", "origin", `${remoteHead}:${topRef}`], { cwd: repository });
    const beforeHead = await commit("unpublished.txt");
    const requestedHead = await commit("adoption.txt");
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead, requestedHead,
    })).resolves.toEqual({ status: "published" });
    const published = await execFileAsync("git", ["ls-remote", "--refs", "origin", topRef], { cwd: repository });
    expect(published.stdout.trim()).toBe(`${requestedHead}\t${topRef}`);
  });

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
    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "published" });
    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: first }))
      .resolves.toEqual({ status: "adopted" });
    const local = await execFileAsync("git", ["show-ref", "--verify", "--hash", ref], { cwd: repository });
    expect(local.stdout.trim()).toBe(first);

    await writeFile(join(repository, "second.txt"), "second\n", "utf8");
    await execFileAsync("git", ["add", "second.txt"], { cwd: repository });
    await execFileAsync("git", ["commit", "-m", "second"], { cwd: repository });
    const second = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repository })).stdout.trim();
    const topRef = "refs/heads/feat/example";
    await execFileAsync("git", ["push", "origin", `${first}:${topRef}`], { cwd: repository });
    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead: first, requestedHead: second,
    })).resolves.toEqual({ status: "published" });
    await expect(publishDeliveryTopRef({
      exec, remote: "origin", ref: topRef, beforeHead: first, requestedHead: second,
    })).resolves.toEqual({ status: "adopted" });
    const publishedTop = await execFileAsync("git", ["ls-remote", "--refs", "origin", topRef], { cwd: repository });
    expect(publishedTop.stdout.trim()).toBe(`${second}\t${topRef}`);

    await expect(publishDeliveryMemberRef({ exec, remote: "origin", ref, head: second }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
    const retained = await execFileAsync("git", ["ls-remote", "--refs", "origin", ref], { cwd: repository });
    expect(retained.stdout.trim()).toBe(`${first}\t${ref}`);
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: second }))
      .resolves.toEqual({ status: "refused", reason: "collision" });
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: first }))
      .resolves.toEqual({ status: "deleted" });
    await expect(deleteDeliveryRemoteRef({ exec, remote: "origin", ref, expectedHead: first }))
      .resolves.toEqual({ status: "adopted" });
  });
});
