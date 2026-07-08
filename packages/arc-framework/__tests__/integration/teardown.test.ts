/**
 * Integration coverage for `arc teardown` — the post-merge cleanup verb — over
 * real git repositories.
 *
 * The priority surface is merge-strategy independence: a squash- or rebase-merge
 * rewrites history, so the original branch tip is no longer reachable from the
 * integration base and `git branch -d` false-negatives ("not fully merged"),
 * leaving the branch to linger. Teardown's merged-safe delete instead checks
 * containment against the branch's own remote-tracking ref, so it reaps the branch
 * across squash, rebase, and merge-commit ship paths alike. The realistic
 * post-merge state — the platform deleted the remote branch, leaving a *stale*
 * local tracking ref until prune — is reproduced by deleting the ref in the bare
 * origin while the working clone keeps its tracking ref. The merge also lands on
 * `origin/main` (a real PR merge advances the remote base), so a separate case rolls
 * the *local* base back behind `origin/main` to prove the reap refreshes the base
 * before its safety check rather than trusting a stale local ref.
 *
 * The linked-worktree teardown and the dirty-worktree refusal are exercised here
 * with real `git worktree` rather than spies; the orchestration decisions live in
 * the verb's unit tests.
 */

import { describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { setupMultiClone, type MultiClone } from "../helpers/multi-clone.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { LifecycleIndexFs } from "../../src/lib/work-unit/lifecycle-index.js";
import {
  runBranchTeardown,
  runTeardown,
  type TeardownContext,
} from "../../src/lib/work-unit/verbs/teardown.js";

const execFileAsync = promisify(execFile);

type MergeStrategy = "squash" | "rebase" | "merge-commit";

/** Run a git command in `cwd`, returning trimmed stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
  return stdout.trim();
}

/** Whether a local branch ref exists in `cwd`. */
async function branchPresent(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** A real GitExec honoring `opts.cwd` (defaulting to the clone root) — the handler's shape. */
function execFor(cloneA: string): GitExec {
  return async (cmd, args, opts) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, { cwd: opts?.cwd ?? cloneA });
    return { stdout: stdout.trimEnd(), stderr };
  };
}

/** The production-shape index-scan seam over real directories. */
const indexFs: LifecycleIndexFs = {
  readdir: (p) => readdir(p, { withFileTypes: true }),
  readFile: (p) => readFile(p, "utf8"),
};

function teardownCtx(cloneA: string): TeardownContext {
  return { cwd: cloneA, exec: execFor(cloneA), indexFs, chdir: () => {} };
}

/** Write a shipped `completed/` meta so the arc-state gate authorizes the slug. */
async function writeShippedMeta(cloneA: string, name: string): Promise<void> {
  const dir = join(cloneA, ".arc", "completed", "2026-q2", `01_${name}`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `meta-${name}.md`),
    `# Metadata: ${name}\n\n` +
      `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
      `|-----------|-----------|------------|-----------|--------------|\n` +
      `| \`Shipped\` | \`clone-a\` | \`[none]\` | \`Novel\` | \`P1\` |\n\n---\n`,
  );
}

/**
 * Build the post-merge state for `feat/<name>` in clone A: a pushed feature branch
 * merged into `main` by `strategy`, with the remote branch deleted (so clone A's
 * tracking ref is stale) and HEAD switched back to `main`. Returns the feature
 * branch's tip sha.
 */
async function shipFeature(
  h: MultiClone,
  name: string,
  strategy: MergeStrategy,
  opts?: {
    /** Also prune clone A's local remote-tracking ref (the post-`git pull` state). */
    pruneLocalRef?: boolean;
    /** Branch to leave checked out in clone A (default `main`); set to the feature branch for the in-place case. */
    endOn?: string;
    /**
     * Reset clone A's local `main` back to its pre-merge sha after the merge is
     * pushed to origin — the realistic post-remote-merge state where `origin/main`
     * carries the merge but the local base has not yet pulled it.
     */
    staleLocalBase?: boolean;
    /**
     * Leave the feature branch's live head on the bare origin — the plain-merge
     * state on a host without delete-on-merge, where the remote branch lingers
     * for teardown to clean.
     */
    keepRemoteBranch?: boolean;
  },
): Promise<void> {
  const { cloneA, origin } = h;
  const branch = `feat/${name}`;

  await git(cloneA, ["checkout", "main"]);
  await git(cloneA, ["checkout", "-b", branch]);
  await writeFile(join(cloneA, `${name}.txt`), "feature work\n");
  await git(cloneA, ["add", `${name}.txt`]);
  await git(cloneA, ["commit", "-m", `feat: ${name}`]);
  const tip = await git(cloneA, ["rev-parse", branch]);
  await git(cloneA, ["push", "-u", "origin", branch]);

  await git(cloneA, ["checkout", "main"]);
  const preMergeMain = await git(cloneA, ["rev-parse", "main"]);
  if (strategy === "squash") {
    await git(cloneA, ["merge", "--squash", branch]);
    await git(cloneA, ["commit", "-m", `squash: ${name}`]);
  } else if (strategy === "merge-commit") {
    await git(cloneA, ["merge", "--no-ff", branch, "-m", `merge: ${name}`]);
  } else {
    // Rebase-merge: the platform rebases the branch's commit onto main (a new sha);
    // the local branch ref is untouched, so its original tip is unreachable from main.
    await writeFile(join(cloneA, "base-advance.txt"), "base moved\n");
    await git(cloneA, ["add", "base-advance.txt"]);
    await git(cloneA, ["commit", "-m", "chore: advance base"]);
    await git(cloneA, ["cherry-pick", tip]);
  }

  // The merge lands on the remote base too — the realistic post-PR-merge state
  // (`origin/main` advanced on the platform), which the teardown reap checks against.
  await git(cloneA, ["push", "origin", "main"]);
  if (opts?.staleLocalBase === true) {
    // Roll the local base back behind `origin/main`: the merge is on the remote but
    // not yet pulled, so a check against the local base would false-negative.
    await git(cloneA, ["reset", "--hard", preMergeMain]);
  }

  // Simulate delete-on-merge from the remote side: the bare origin loses the branch
  // while clone A keeps its (now stale) remote-tracking ref until prune. With
  // `keepRemoteBranch`, the live head stays instead — the plain-merge state.
  if (opts?.keepRemoteBranch !== true) {
    await git(origin, ["update-ref", "-d", `refs/heads/${branch}`]);
  }
  if (opts?.pruneLocalRef === true) {
    // The post-`git pull`/prune state: clone A's tracking ref is gone too, so the
    // upstream containment check can no longer prove preservation.
    await git(cloneA, ["update-ref", "-d", `refs/remotes/origin/${branch}`]);
  }
  await git(cloneA, ["checkout", opts?.endOn ?? "main"]);
}

/** Build the post-squash state for a recordless cheap branch. */
async function shipCheapBranch(h: MultiClone, branch: string): Promise<void> {
  const { cloneA, origin } = h;
  const file = branch.replace("/", "-") + ".txt";

  await git(cloneA, ["checkout", "main"]);
  await git(cloneA, ["checkout", "-b", branch]);
  await writeFile(join(cloneA, file), "cheap-branch work\n");
  await git(cloneA, ["add", file]);
  await git(cloneA, ["commit", "-m", `chore: ${branch}`]);
  await git(cloneA, ["push", "-u", "origin", branch]);

  await git(cloneA, ["checkout", "main"]);
  await git(cloneA, ["merge", "--squash", branch]);
  await git(cloneA, ["commit", "-m", `squash: ${branch}`]);
  await git(cloneA, ["push", "origin", "main"]);

  // Simulate delete-on-merge plus a local prune: no upstream ref remains to prove
  // preservation, and `git branch -d` would still reject the squash-rewritten tip.
  await git(origin, ["update-ref", "-d", `refs/heads/${branch}`]);
  await git(cloneA, ["update-ref", "-d", `refs/remotes/origin/${branch}`]);
  await git(cloneA, ["checkout", "main"]);
}

/** Make local ARC user surfaces ignored, matching installed ARC projects. */
async function ignoreArcUserDir(cloneA: string): Promise<void> {
  await writeFile(join(cloneA, ".gitignore"), ".arc/user/\n");
  await git(cloneA, ["add", ".gitignore"]);
  await git(cloneA, ["commit", "-m", "chore: ignore user surfaces"]);
  await git(cloneA, ["push", "origin", "main"]);
}

describe("arc teardown — merge-strategy-independent branch reaping", () => {
  for (const strategy of ["squash", "rebase", "merge-commit"] as const) {
    it(`reaps the merged branch and prunes the stale ref on a ${strategy} ship path`, async () => {
      const h = await setupMultiClone();
      try {
        await shipFeature(h, "demo", strategy);
        await writeShippedMeta(h.cloneA, "demo");
        expect(await branchPresent(h.cloneA, "feat/demo")).toBe(true);

        const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

        expect(result.status).toBe("torn-down");
        if (result.status !== "torn-down") return;
        expect(result.branch).toBe("feat/demo");
        expect(result.branchDeleted).toBe(true);
        // The platform already deleted the remote head (delete-on-merge), so the
        // remote leg is the idempotent no-op — no deletion claimed, no notice.
        expect(result.remoteBranchDeleted).toBe(false);
        expect(result.notices.some((n) => /remote branch/i.test(n))).toBe(false);
        // No lingering local branch, and the stale tracking ref is pruned.
        expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
        const remotes = await git(h.cloneA, ["for-each-ref", "--format=%(refname)", "refs/remotes/origin"]);
        expect(remotes).not.toContain("feat/demo");
      } finally {
        await h.cleanup();
      }
    });
  }

  it("deletes the live remote head on a plain merge where origin still has the branch", async () => {
    const h = await setupMultiClone();
    try {
      // The plain-merge state on a host without delete-on-merge: the PR merged,
      // but `refs/heads/feat/demo` is still live on origin.
      await shipFeature(h, "demo", "merge-commit", { keepRemoteBranch: true });
      await writeShippedMeta(h.cloneA, "demo");
      expect(await git(h.origin, ["show-ref", "--verify", "refs/heads/feat/demo"])).toContain("feat/demo");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branchDeleted).toBe(true);
      expect(result.remoteBranchDeleted).toBe(true);
      // Gone everywhere: local branch, the live remote head, and the tracking ref.
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
      await expect(
        git(h.origin, ["show-ref", "--verify", "--quiet", "refs/heads/feat/demo"]),
      ).rejects.toThrow();
      const remotes = await git(h.cloneA, ["for-each-ref", "--format=%(refname)", "refs/remotes/origin"]);
      expect(remotes).not.toContain("feat/demo");
    } finally {
      await h.cleanup();
    }
  });

  it("leaves the live remote head when it is the sole proven preservation (multi-commit squash)", async () => {
    const h = await setupMultiClone();
    try {
      // Two commits squashed into one: the members' patch-ids cannot match the
      // squash commit, so landed-in-base is unprovable — only upstream containment
      // proves preservation, and the remote head is where the work is kept.
      const branch = "feat/demo";
      await git(h.cloneA, ["checkout", "main"]);
      await git(h.cloneA, ["checkout", "-b", branch]);
      await writeFile(join(h.cloneA, "demo-1.txt"), "first\n");
      await git(h.cloneA, ["add", "demo-1.txt"]);
      await git(h.cloneA, ["commit", "-m", "feat: demo part 1"]);
      await writeFile(join(h.cloneA, "demo-2.txt"), "second\n");
      await git(h.cloneA, ["add", "demo-2.txt"]);
      await git(h.cloneA, ["commit", "-m", "feat: demo part 2"]);
      await git(h.cloneA, ["push", "-u", "origin", branch]);
      await git(h.cloneA, ["checkout", "main"]);
      await git(h.cloneA, ["merge", "--squash", branch]);
      await git(h.cloneA, ["commit", "-m", "squash: demo"]);
      await git(h.cloneA, ["push", "origin", "main"]);
      await writeShippedMeta(h.cloneA, "demo");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      // Local reap lands (upstream containment), but the remote head survives.
      expect(result.branchDeleted).toBe(true);
      expect(result.remoteBranchDeleted).toBe(false);
      expect(result.notices.some((n) => /remote branch.*left intact/i.test(n))).toBe(true);
      expect(await branchPresent(h.cloneA, branch)).toBe(false);
      expect(await git(h.origin, ["show-ref", "--verify", `refs/heads/${branch}`])).toContain(branch);
    } finally {
      await h.cleanup();
    }
  });

  it("reaps a branch whose tip is unreachable from base (the squash/rebase false-negative)", async () => {
    const h = await setupMultiClone();
    try {
      await shipFeature(h, "demo", "squash");
      await writeShippedMeta(h.cloneA, "demo");

      // The squashed tip is NOT reachable from `main` — the exact condition under
      // which a base-reachability delete (`git branch -d` against base) false-
      // negatives and leaves the branch to linger.
      await expect(
        git(h.cloneA, ["merge-base", "--is-ancestor", "feat/demo", "main"]),
      ).rejects.toThrow();
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(true);

      // Teardown checks containment against the branch's own upstream instead, so it
      // reaps the branch regardless of how `main` merged it.
      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branchDeleted).toBe(true);
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
    } finally {
      await h.cleanup();
    }
  });

  it("reaps a merged branch when the local tracking ref is also pruned (base patch-equivalence)", async () => {
    const h = await setupMultiClone();
    try {
      // Squash ship + the tracking ref pruned: the upstream-only check has no ref to
      // read, and the squashed tip is unreachable from `main`, so only patch
      // identity (`git cherry`) proves preservation. The fault-(B) fix.
      await shipFeature(h, "demo", "squash", { pruneLocalRef: true });
      await writeShippedMeta(h.cloneA, "demo");
      await expect(
        git(h.cloneA, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/feat/demo"]),
      ).rejects.toThrow();
      await expect(
        git(h.cloneA, ["merge-base", "--is-ancestor", "feat/demo", "main"]),
      ).rejects.toThrow();

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branchDeleted).toBe(true);
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
    } finally {
      await h.cleanup();
    }
  });

  it("reaps a merged branch against the refreshed remote base when the local base is stale", async () => {
    const h = await setupMultiClone();
    try {
      // The realistic post-remote-merge state: `origin/main` carries the squash, the
      // local base is rolled back behind it (not yet pulled), and the tracking ref is
      // pruned. The upstream leg has no ref, and a check against the *local* base
      // false-negatives — only a fetch + landed-in-base against `origin/main` proves
      // preservation. This refused (forcing a manual fetch + retry) before the fix.
      await shipFeature(h, "demo", "squash", { staleLocalBase: true, pruneLocalRef: true });
      await writeShippedMeta(h.cloneA, "demo");
      // Local base lacks the squash; the tracking ref is gone.
      await expect(
        git(h.cloneA, ["merge-base", "--is-ancestor", "feat/demo", "main"]),
      ).rejects.toThrow();
      await expect(
        git(h.cloneA, ["rev-parse", "--verify", "--quiet", "refs/remotes/origin/feat/demo"]),
      ).rejects.toThrow();

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branchDeleted).toBe(true);
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
    } finally {
      await h.cleanup();
    }
  });

  it("relocates the primary off an in-place merged branch, then reaps it (the fault-(A) fix)", async () => {
    const h = await setupMultiClone();
    try {
      // Merge-commit ship, tracking ref pruned, branch left checked out in the
      // primary clone — the in-place WU post-merge state. The reap would be refused
      // ("branch used by worktree") without the relocation.
      await shipFeature(h, "demo", "merge-commit", { pruneLocalRef: true, endOn: "feat/demo" });
      await writeShippedMeta(h.cloneA, "demo");
      expect(await git(h.cloneA, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("feat/demo");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branchDeleted).toBe(true);
      expect(result.worktreeRemoved).toBeNull(); // in-place: no distinct worktree removed
      expect(await git(h.cloneA, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
      expect(result.notices.some((n) => /relocated the primary worktree/iu.test(n))).toBe(true);
    } finally {
      await h.cleanup();
    }
  });
});

describe("arc teardown --branch — recordless cheap branches over real git", () => {
  it("reaps a merged recordless chore branch when the tracking ref is pruned", async () => {
    const h = await setupMultiClone();
    const branch = "chore/groom-demo";
    try {
      await shipCheapBranch(h, branch);
      await expect(
        git(h.cloneA, ["merge-base", "--is-ancestor", branch, "main"]),
      ).rejects.toThrow();
      await expect(
        git(h.cloneA, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`]),
      ).rejects.toThrow();

      const result = await runBranchTeardown(teardownCtx(h.cloneA), { branch, base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.branch).toBe(branch);
      expect(result.branchDeleted).toBe(true);
      expect(await branchPresent(h.cloneA, branch)).toBe(false);
    } finally {
      await h.cleanup();
    }
  });
});

describe("arc teardown — worktree dispatch over real git", () => {
  it("removes a linked worktree, then reaps its branch", async () => {
    const h = await setupMultiClone();
    const wtParent = await mkdtemp(join(tmpdir(), "arc-teardown-wt-"));
    try {
      // Ship the branch, then spawn a linked worktree checked out on it.
      await shipFeature(h, "demo", "merge-commit");
      await writeShippedMeta(h.cloneA, "demo");
      const wtPath = join(wtParent, "wt");
      await git(h.cloneA, ["worktree", "add", wtPath, "feat/demo"]);

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      // The roster reports the realpath (macOS symlinks /var → /private/var), so
      // match on the unique leaf rather than the pre-realpath form.
      expect(result.worktreeRemoved).not.toBeNull();
      expect(result.worktreeRemoved?.endsWith("/wt")).toBe(true);
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(false);
      const worktrees = await git(h.cloneA, ["worktree", "list"]);
      expect(worktrees).not.toContain(result.worktreeRemoved!);
    } finally {
      await rm(wtParent, { recursive: true, force: true });
      await h.cleanup();
    }
  });

  it("refuses to tear down a dirty linked worktree (no `--force`)", async () => {
    const h = await setupMultiClone();
    const wtParent = await mkdtemp(join(tmpdir(), "arc-teardown-wt-"));
    try {
      await shipFeature(h, "demo", "merge-commit");
      await writeShippedMeta(h.cloneA, "demo");
      const wtPath = join(wtParent, "wt");
      await git(h.cloneA, ["worktree", "add", wtPath, "feat/demo"]);
      await writeFile(join(wtPath, "uncommitted.txt"), "dirty\n");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") return;
      expect(result.reason).toMatch(/dirty worktree/i);
      // Nothing reaped: the branch and worktree survive the refusal.
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(true);
    } finally {
      await rm(wtParent, { recursive: true, force: true });
      await h.cleanup();
    }
  });

  it("reconciles ignored linked identity-global entries before removing a clean worktree", async () => {
    const h = await setupMultiClone();
    const wtParent = await mkdtemp(join(tmpdir(), "arc-teardown-wt-"));
    try {
      await ignoreArcUserDir(h.cloneA);
      await shipFeature(h, "demo", "merge-commit");
      await writeShippedMeta(h.cloneA, "demo");
      const wtPath = join(wtParent, "wt");
      await git(h.cloneA, ["worktree", "add", wtPath, "feat/demo"]);

      const primaryUserDir = join(h.cloneA, ".arc", "user", "clone-a");
      const linkedUserDir = join(wtPath, ".arc", "user", "clone-a");
      await mkdir(primaryUserDir, { recursive: true });
      await mkdir(linkedUserDir, { recursive: true });
      await writeFile(
        join(primaryUserDir, "USER-INBOX.md"),
        "# User Inbox\n\n## Errand\n\n## Work Unit\n",
      );
      await writeFile(
        join(linkedUserDir, "USER-INBOX.md"),
        [
          "# User Inbox",
          "",
          "## Errand",
          "",
          "### `[ ]` **save linked capture**",
          "",
          "- _Created:_ `2026-07-05`",
          "",
          "## Work Unit",
          "",
        ].join("\n"),
      );
      expect(await git(wtPath, ["status", "--porcelain"])).toBe("");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("torn-down");
      if (result.status !== "torn-down") return;
      expect(result.worktreeRemoved?.endsWith("/wt")).toBe(true);
      expect(await readFile(join(primaryUserDir, "USER-INBOX.md"), "utf-8")).toContain("save linked capture");
      const worktrees = await git(h.cloneA, ["worktree", "list"]);
      expect(worktrees).not.toContain(result.worktreeRemoved!);
    } finally {
      await rm(wtParent, { recursive: true, force: true });
      await h.cleanup();
    }
  });

  it("refuses to remove a clean linked worktree with an unreconciled unknown identity-global file", async () => {
    const h = await setupMultiClone();
    const wtParent = await mkdtemp(join(tmpdir(), "arc-teardown-wt-"));
    try {
      await ignoreArcUserDir(h.cloneA);
      await shipFeature(h, "demo", "merge-commit");
      await writeShippedMeta(h.cloneA, "demo");
      const wtPath = join(wtParent, "wt");
      await git(h.cloneA, ["worktree", "add", wtPath, "feat/demo"]);

      const primaryUserDir = join(h.cloneA, ".arc", "user", "clone-a");
      const linkedUserDir = join(wtPath, ".arc", "user", "clone-a");
      await mkdir(primaryUserDir, { recursive: true });
      await mkdir(linkedUserDir, { recursive: true });
      await writeFile(join(primaryUserDir, "FUTURE.md"), "primary\n");
      await writeFile(join(linkedUserDir, "FUTURE.md"), "linked\n");
      expect(await git(wtPath, ["status", "--porcelain"])).toBe("");

      const result = await runTeardown(teardownCtx(h.cloneA), { name: "demo", base: "main" });

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") return;
      expect(result.reason).toMatch(/identity-global user surface/i);
      expect(await readFile(join(primaryUserDir, "FUTURE.md"), "utf-8")).toBe("primary\n");
      const worktrees = await git(h.cloneA, ["worktree", "list"]);
      expect(worktrees).toContain(wtPath);
      expect(await branchPresent(h.cloneA, "feat/demo")).toBe(true);
    } finally {
      await rm(wtParent, { recursive: true, force: true });
      await h.cleanup();
    }
  });
});
