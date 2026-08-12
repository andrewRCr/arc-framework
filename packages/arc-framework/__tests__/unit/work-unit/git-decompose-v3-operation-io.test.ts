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
  it("creates and idempotently reuses an exact ARC-owned candidate", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-candidate-ready-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    await writeFile(join(root, "seed.txt"), "seed\n");
    await git(root, ["add", "seed.txt"]);
    await git(root, ["commit", "-qm", "seed"]);

    const baseHead = (await git(root, ["rev-parse", "HEAD"])).trim();
    const branch = "chore/decompose-ready";
    const path = join(root, "candidate");
    let worktreeAdds = 0;
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") worktreeAdds += 1;
      return { stdout: await git(options?.cwd ?? root, args), stderr: "" };
    };
    const io = await createGitV3DecomposeOperationIO({
      cwd: root,
      exec,
      spawningIdentity: "test",
      blobs: [],
    });
    const request = { branch, baseHead, path };

    const created = await io.occupation.ensureCandidate(request);
    expect(created).toEqual({
      status: "ready",
      observation: {
        branchHead: baseHead,
        registrations: [{
          path,
          candidateBranch: branch,
          head: baseHead,
          occupied: false,
          markerOwned: true,
        }],
      },
    });
    expect(await git(root, ["branch", "--list", branch])).toContain(branch);
    expect(await git(root, ["worktree", "list", "--porcelain"])).toContain(path);
    await expect(readWorktreeMarker(path)).resolves.toMatchObject({
      kind: "present",
      marker: {
        spawnedByArc: true,
        spawningIdentity: "test",
        createdFor: { kind: "branch", ref: branch },
      },
    });

    await expect(io.occupation.ensureCandidate(request)).resolves.toEqual(created);
    expect(worktreeAdds).toBe(1);
  });

  it("preserves exact unmarked topology after a post-add marker failure", async () => {
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
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") worktreeAdds += 1;
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
      noMutation: false,
    });
    await expect(access(path)).resolves.toBeUndefined();
    expect(await git(root, ["branch", "--list", branch])).toContain(branch);
    expect(await git(root, ["worktree", "list", "--porcelain"])).toContain(path);
    await expect(readWorktreeMarker(path)).resolves.toEqual({ kind: "absent" });

    await expect(io.occupation.ensureCandidate(request)).resolves.toEqual({
      status: "collision",
      noMutation: false,
    });
    expect(worktreeAdds).toBe(1);
    await expect(readWorktreeMarker(path)).resolves.toEqual({ kind: "absent" });
  });

  it("preserves a foreign exact candidate that wins the atomic add race", async () => {
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
    let raceAdd = true;
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree" && args[1] === "add") {
        adapterWorktreeAdds += 1;
        if (raceAdd) {
          raceAdd = false;
          await git(root, ["worktree", "add", "-q", "-b", branch, path, baseHead]);
        }
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

    await expect(io.occupation.ensureCandidate({ branch, baseHead, path })).resolves.toEqual({
      status: "collision",
      noMutation: false,
    });
    expect(adapterWorktreeAdds).toBe(1);
    expect(await git(root, ["branch", "--list", branch])).toContain(branch);
    expect(await git(root, ["worktree", "list", "--porcelain"])).toContain(path);
    await expect(readWorktreeMarker(path)).resolves.toEqual({ kind: "absent" });
  });
});
