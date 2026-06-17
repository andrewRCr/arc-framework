/**
 * Integration guard for the executor's relocate+rewrite staging, against real git.
 *
 * `relocate-artifacts` stages its `git mv` — which snapshots the file's *indexed*
 * (pre-rewrite) content — while the content legs (`set-phase`, branch-field clear,
 * soft-field reset) write through the fs seam unstaged. Without the executor's
 * `stageMeta` step, the meta lands as a staged rename of stale content plus an
 * unstaged worktree edit (`git status` → `RM`), so a commit that doesn't re-add it
 * ships the pre-flip state. This replays the archive edge's binder seams over a real
 * repo and asserts the flip is staged, not left as worktree residue.
 *
 * The companion unit coverage (`lifecycle-executor.test.ts`) asserts the executor
 * *calls* `stageMeta` after the content legs; this asserts the real git mechanics.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

/** An Integrating-state managed meta — the archive edge's source. */
function integratingMeta(): string {
  return (
    `# Metadata: demo\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`Integrating\` | \`test-user\` | \`feat/demo\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Cohort:** [none]\n- **Depends On:** [none]\n\n` +
    `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** [none]\n\n---\n`
  );
}

describe("executor staging — relocate + content rewrite leaves the meta fully staged", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-archive-staging-");
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("stages the content flip over the git-mv'd snapshot (no unstaged RM residue)", async () => {
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    const activeRel = ".arc/active/meta-demo.md";
    await writeFile(join(repo, activeRel), integratingMeta());
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "active demo"], { cwd: repo });

    const ctx = buildExecutorContext({
      cwd: repo,
      io: { ...createUserIOContext(), exec: makeGitExec(repo) },
      identity: "test-user",
      teamMode: false,
      internalTemplateDir: getInternalTemplatePath(),
    });

    const toDir = ".arc/completed/2026-q2/01_demo";
    const completedRel = posix.join(toDir, "meta-demo.md");

    // Replay the archive edge's mutator legs in canonical order (set-phase before
    // relocate) through the real binder seams, then stage — the exact live sequence.
    await ctx.setPhase({ metaPath: activeRel, phase: "Shipped" });
    await ctx.relocateArtifacts({ slug: "demo", fromDir: ".arc/active", toDir });
    await ctx.writeBranchField(completedRel, "[none]");
    await ctx.stageMeta!(completedRel);

    // No unstaged residue — the flip is staged, not a worktree `M` over a git-mv'd
    // (stale) index entry. This is the assertion the `git add -A` round-trip can't make.
    const { stdout: unstaged } = await execFileAsync("git", ["diff", "--name-only"], { cwd: repo });
    expect(unstaged.trim()).toBe("");

    // And what is staged is the flip, not the pre-flip snapshot.
    const { stdout: staged } = await execFileAsync("git", ["show", `:${completedRel}`], { cwd: repo });
    expect(staged).toContain("`Shipped`");
    expect(staged).toContain("[none]");
  });
});
