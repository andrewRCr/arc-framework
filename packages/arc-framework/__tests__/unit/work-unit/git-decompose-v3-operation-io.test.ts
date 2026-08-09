import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
