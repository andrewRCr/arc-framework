/** Scripted Git checkouts with shared operational authority and isolated working directories. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptGitExec, type GitExecScriptEntry } from "../git-exec-fake.js";
import type { createLifecycleHarness } from "./lifecycle-harness.js";
import { writeWorktreeMarker, type WorktreeSubject, type TransientWorktreeSubject } from "../../../src/lib/git/worktree-marker.js";

/** Make one process-free checkout; callers may extend its strict Git script at observed seams. */
export async function createReviewCheckout<T extends ReturnType<typeof createLifecycleHarness>>(harness: T,
  options: { identity?: string; script?: GitExecScriptEntry[] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "arc-review-checkout-"));
  const cwd = join(root, "checkout"), commonDir = join(root, "git-common");
  await mkdir(join(cwd, ".arc", "system"), { recursive: true });
  await mkdir(commonDir);
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"), "branch.base: main\narchive.cadence: with-integration\n");
  let branch: string | null = "main";
  const identity = options.identity ?? "test-user";
  const scripted = scriptGitExec([...(options.script ?? []),
    { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] },
    { match: ["worktree", "list", "--porcelain", "-z"], responses: [() => ({
      stdout: `worktree ${cwd}\0HEAD ${"a".repeat(40)}\0${branch === null ? "detached" : `branch refs/heads/${branch}`}\0\0`,
    })] },
    { match: ["status", "--porcelain=v1", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [() => ({ stdout: branch ?? "HEAD" })] },
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: `${identity}\0` }] },
  ]);
  return { ...harness, cwd, commonDir, ...scripted, identity,
    occupy: async (nextBranch: string | null, createdFor: Extract<WorktreeSubject, { kind: "work-unit" }> | TransientWorktreeSubject) => {
      branch = nextBranch;
      const base = { spawnedByArc: false, spawningIdentity: identity, createdAt: "2026-10-19T12:00:00.000Z" };
      if (createdFor.kind === "work-unit") await writeWorktreeMarker(cwd, { ...base, createdFor });
      else await writeWorktreeMarker(cwd, { ...base, createdFor, provisioning: "ready" });
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
