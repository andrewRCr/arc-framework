import { execFile } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { createGitV3DecomposeOperationIO } from "../../../src/lib/work-unit/git-decompose-v3-operation-io.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("Git v3 decomposition candidate creation", () => {
  it("rolls back a failed post-add marker step and retries idempotently", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-retry-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = "chore/decompose-marker-retry";
    const path = join(root, "candidate");
    let failMarkerIgnore = true;
    let worktreeAdds = 0;
    let worktreeRemoves = 0;
    const branchDeletes: string[][] = [];
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") worktreeAdds += 1;
      if (args[0] === "worktree" && args[1] === "remove") worktreeRemoves += 1;
      if (args[0] === "branch" && args[1] === "-d") branchDeletes.push(args);
      if (failMarkerIgnore
        && options?.cwd === path
        && args[0] === "rev-parse"
        && args[1] === "--git-path"
        && args[2] === "info/exclude") {
        failMarkerIgnore = false;
        throw new Error("injected marker-ignore failure");
      }
      return {
        stdout: await git(options?.cwd ?? root, args),
        stderr: "",
      };
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root,
      exec,
      spawningIdentity: "test",
      blobs: [],
    });
    const request = { branch, baseHead, path };

    await expect(io.occupation.ensureCandidate(request)).resolves.toMatchObject({
      status: "collision",
      noMutation: true,
    });
    await expect(access(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(root, ["branch", "--list", branch])).toBe("");
    expect(await git(root, ["worktree", "list", "--porcelain"])).not.toContain(path);

    const retried = await io.occupation.ensureCandidate(request);
    expect(retried.status).toBe("ready");
    await expect(readWorktreeMarker(path)).resolves.toMatchObject({
      kind: "present",
      marker: {
        spawnedByArc: true,
        createdFor: { kind: "branch", ref: branch },
      },
    });
    await expect(io.occupation.ensureCandidate(request)).resolves.toEqual(retried);
    expect({ worktreeAdds, worktreeRemoves, branchDeletes }).toEqual({
      worktreeAdds: 2,
      worktreeRemoves: 1,
      branchDeletes: [["branch", "-d", "--", branch]],
    });
  });

  it("resumes durable rollback authority after a rollback command fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-rollback-retry-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const request = {
      branch: "chore/decompose-rollback-retry",
      baseHead,
      path: join(root, "candidate"),
    };
    let failMarkerIgnore = true;
    let failRemove = true;
    let worktreeAdds = 0;
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") worktreeAdds += 1;
      if (failMarkerIgnore && options?.cwd === request.path
        && args.slice(0, 3).join(" ") === "rev-parse --git-path info/exclude") {
        failMarkerIgnore = false;
        throw new Error("injected marker-ignore failure");
      }
      if (failRemove && args[0] === "worktree" && args[1] === "remove") {
        failRemove = false;
        throw new Error("injected rollback removal failure");
      }
      return { stdout: await git(options?.cwd ?? root, args), stderr: "" };
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root, exec, spawningIdentity: "test", blobs: [],
    });

    await expect(io.occupation.ensureCandidate(request)).resolves.toMatchObject({
      status: "collision", noMutation: false,
    });
    await expect(io.occupation.ensureCandidate(request)).resolves.toMatchObject({ status: "ready" });
    expect(worktreeAdds).toBe(2);
    await expect(readWorktreeMarker(request.path)).resolves.toMatchObject({ kind: "present" });
  });

  it("preserves user content that races post-add rollback", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-content-race-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = "chore/decompose-content-race";
    const path = join(root, "candidate");
    let failMarkerIgnore = true;
    let raceStatus = true;
    const exec: GitExec = async (_command, args, options) => {
      if (failMarkerIgnore
        && options?.cwd === path
        && args[0] === "rev-parse"
        && args[1] === "--git-path"
        && args[2] === "info/exclude") {
        failMarkerIgnore = false;
        throw new Error("injected marker-ignore failure");
      }
      const result = {
        stdout: await git(options?.cwd ?? root, args),
        stderr: "",
      };
      if (raceStatus && options?.cwd === path && args[0] === "status") {
        raceStatus = false;
        await writeFile(join(path, "user-content.txt"), "preserve me\n");
      }
      return result;
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root,
      exec,
      spawningIdentity: "test",
      blobs: [],
    });

    await expect(io.occupation.ensureCandidate({ branch, baseHead, path })).resolves.toEqual({
      status: "collision",
      noMutation: false,
    });
    await expect(access(join(path, "user-content.txt"))).resolves.toBeUndefined();
    expect(await git(root, ["branch", "--list", branch])).toContain(branch);
    await expect(readWorktreeMarker(path)).resolves.toEqual({ kind: "absent" });

    await rm(join(path, "user-content.txt"));
    await expect(io.occupation.ensureCandidate({ branch, baseHead, path })).resolves.toMatchObject({
      status: "ready",
    });
    await expect(readWorktreeMarker(path)).resolves.toMatchObject({ kind: "present" });
  });

  it("preserves a foreign worktree attached immediately before branch deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-delete-race-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = "chore/decompose-delete-race";
    const path = join(root, "candidate");
    const foreignPath = join(root, "foreign");
    let failMarkerIgnore = true;
    let attachForeign = true;
    const exec: GitExec = async (_command, args, options) => {
      if (failMarkerIgnore && options?.cwd === path
        && args.slice(0, 3).join(" ") === "rev-parse --git-path info/exclude") {
        failMarkerIgnore = false;
        throw new Error("injected marker-ignore failure");
      }
      if (attachForeign && args[0] === "branch" && args[1] === "-d") {
        attachForeign = false;
        await git(root, ["worktree", "add", "-q", foreignPath, branch]);
      }
      return { stdout: await git(options?.cwd ?? root, args), stderr: "" };
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root, exec, spawningIdentity: "test", blobs: [],
    });

    await expect(io.occupation.ensureCandidate({ branch, baseHead, path })).resolves.toMatchObject({
      status: "collision", noMutation: false,
    });
    expect(await git(root, ["branch", "--list", branch])).toContain(branch);
    expect(await git(root, ["worktree", "list", "--porcelain"])).toContain(foreignPath);
  });

  it("does not claim a foreign exact candidate that appears after initial observation", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-race-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = "chore/decompose-raced-origin";
    const path = join(root, "candidate");
    let adapterWorktreeAdds = 0;
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") adapterWorktreeAdds += 1;
      return {
        stdout: await git(options?.cwd ?? root, args),
        stderr: "",
      };
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root,
      exec,
      spawningIdentity: "test",
      blobs: [],
    });

    await expect(io.occupation.observeCandidate(branch, path)).resolves.toEqual({
      branchHead: null,
      registrations: [],
    });

    // A foreign actor wins the race with the exact topology ARC intended to create.
    await git(root, ["worktree", "add", "-q", "-b", branch, path, baseHead]);

    await expect(io.occupation.ensureCandidate({ branch, baseHead, path })).resolves.toEqual({
      status: "collision",
      noMutation: false,
    });
    expect(adapterWorktreeAdds).toBe(0);
    await expect(readWorktreeMarker(path)).resolves.toEqual({ kind: "absent" });
  });
});
