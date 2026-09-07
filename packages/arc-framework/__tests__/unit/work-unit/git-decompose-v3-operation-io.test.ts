import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { readWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { executeV3ExtractionSourceFinish } from
  "../../../src/lib/work-unit/decompose-v3-finish-operation.js";
import {
  createGitV3DecomposeOperationIO,
  createGitV3ExtractionSourceFinishIO,
} from "../../../src/lib/work-unit/git-decompose-v3-operation-io.js";
import type { V3ExtractionSourceThinningFilePlan } from
  "../../../src/lib/work-unit/decompose-v3-thinning.js";

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

describe("Git v3 extraction source finish", () => {
  it("restores exact index, worktree, bytes, and modes after a staged-path failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-decompose-finish-rollback-"));
    roots.push(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "arc@example.com"]);
    await git(root, ["config", "user.name", "ARC Test"]);
    const rfcPath = "rfc-origin.md";
    const specPath = "spec-origin.md";
    await writeFile(join(root, rfcPath), "remove\n");
    await writeFile(join(root, specPath), "before\n");
    await chmod(join(root, specPath), 0o755);
    await git(root, ["add", "."]);
    await git(root, ["commit", "-qm", "source"]);
    const plans: V3ExtractionSourceThinningFilePlan[] = [{
      path: rfcPath,
      before: { mode: "100644", contentDigest: digestBytes(new TextEncoder().encode("remove\n")) },
      after: { kind: "absent" },
      removedLocators: [{ artifact: rfcPath, kind: "preamble" }],
    }, {
      path: specPath,
      before: { mode: "100755", contentDigest: digestBytes(new TextEncoder().encode("before\n")) },
      after: { kind: "file", mode: "100755", bytes: new TextEncoder().encode("after\n") },
      removedLocators: [{ artifact: specPath, kind: "preamble" }],
    }];
    let failSecondStage = true;
    const exec: GitExec = async (_command, args, options) => {
      if (failSecondStage
        && args[0] === "add"
        && args.some((argument) => argument.includes(specPath))) {
        failSecondStage = false;
        throw new Error("injected stage failure");
      }
      return { stdout: await git(options?.cwd ?? root, args), stderr: "" };
    };

    await expect(executeV3ExtractionSourceFinish(
      plans,
      true,
      createGitV3ExtractionSourceFinishIO({ cwd: root, exec }),
    )).resolves.toEqual({
      status: "refused",
      reason: "source-apply-failed",
      locus: specPath,
    });
    await expect(readFile(join(root, rfcPath), "utf8")).resolves.toBe("remove\n");
    await expect(readFile(join(root, specPath), "utf8")).resolves.toBe("before\n");
    expect((await stat(join(root, specPath))).mode & 0o777).toBe(0o755);
    expect(await git(root, ["status", "--porcelain=v1"])).toBe("");
  });
});
