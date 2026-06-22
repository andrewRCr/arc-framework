/**
 * E2E for the work-unit exit choreography through the built CLI — `arc decompose`,
 * `arc park`, and the generalized `arc teardown --force`, in real git repos across
 * the **in-place** and **linked** worktree models.
 *
 * This is the coverage the unit/integration tiers structurally could not give: the
 * earlier tests drove the verb *cores* with hand-fed cross-worktree inputs the CLI
 * never generates (origin committed to `main` + a separate clean worktree), so the
 * self-teardown configuration the CLI actually produces was never exercised and a
 * teardown-ordering defect shipped uncaught. These tests drive the verbs through the
 * CLI seam and assert on-disk outcomes — never on core call-args.
 *
 * The post-reframe contract under test: `decompose` / `park@Planning` retire (remove /
 * relocate) the origin's artifacts in-verb but defer its branch + worktree teardown
 * out-of-band to a post-action `arc teardown <slug> --force`. The force mode's four
 * behaviors — dirty-tree refusal, self-teardown locus-hop, in-place primary-switch,
 * and unmerged force-delete — are asserted here in the real repos that produce them.
 */

import { execFile } from "node:child_process";
import { mkdir, writeFile, rm, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { promisify } from "node:util";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run a git command in `cwd`, returning trimmed stdout. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Stage everything and commit, bypassing hooks (scaffolding, not a hook test). */
async function commitAll(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message]);
}

/** Whether a path exists on disk. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Whether a local branch ref exists in `cwd`'s repo. */
async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const out = await git(cwd, ["branch", "--list", branch]);
  return out !== "";
}

/** A minimal but schema-valid `meta-<slug>.md` for a started (`Planning`) WU. */
function startedMeta(slug: string): string {
  return (
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `| --------- | --------- | ----------- | --------- | ------------ |\n` +
    `| \`Planning\` | \`test-user\` | \`plan/${slug}\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Cohort:** [none]\n` +
    `- **Depends On:** [none]\n\n` +
    `- **Origin:** [internal]\n` +
    `- **Design:** \`draft-${slug}.md\`\n\n---\n`
  );
}

/**
 * Scaffold a started (`Planning`) WU on disk in `active/` plus its real
 * `plan/<slug>` branch carrying an **unmerged** commit (so the merged-safe reap
 * would refuse it and only `--force` deletes). Returns once the origin commit on
 * `main` and the plan branch both exist.
 *
 * `model`:
 * - `in-place` — the primary worktree is left checked out on `plan/<slug>`.
 * - `linked`   — the primary stays on `main`; `plan/<slug>` lives in a linked
 *   worktree whose path is returned.
 */
async function scaffoldStartedWu(
  repo: string,
  slug: string,
  model: "in-place" | "linked",
): Promise<{ worktree?: string }> {
  const dir = join(repo, ".arc", "active");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${slug}.md`), startedMeta(slug));
  await writeFile(join(dir, `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** —\n\n---\n`);
  await commitAll(repo, `scaffold origin ${slug}`);

  // Cut the plan branch and give it an unmerged commit (not reachable from main).
  if (model === "in-place") {
    await git(repo, ["checkout", "-b", `plan/${slug}`]);
    await writeFile(join(repo, ".arc", "active", `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** drafting\n\n---\n`);
    await commitAll(repo, `wip on plan/${slug}`);
    return {};
  }
  // linked: create the branch with an unmerged commit in a linked worktree.
  await git(repo, ["branch", `plan/${slug}`]);
  const worktree = join(dirname(repo), `${basename(repo)}-${slug}`);
  await git(repo, ["worktree", "add", worktree, `plan/${slug}`]);
  await writeFile(join(worktree, ".arc", "active", `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** drafting\n\n---\n`);
  await commitAll(worktree, `wip on plan/${slug}`);
  return { worktree };
}

/** Author a symmetric two-member cut-map JSON for `origin`, written to `<repo>/cut.json`. */
async function writeCutMap(repo: string, origin: string, cohort: string, members: string[]): Promise<string> {
  const cut = {
    schemaVersion: 1,
    origin: { slug: origin, phase: "Planning", location: "active" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort,
    entries: members.map((slug) => ({
      kind: "new-member",
      slug,
      workClass: "Light",
      dependsOn: [],
      receives: ["problem-statement"],
    })),
    internalEdges: [],
  };
  const path = join(repo, "cut.json");
  await writeFile(path, JSON.stringify(cut, null, 2));
  return path;
}

describe("lifecycle exit choreography (CLI seam)", () => {
  let repo: string;
  const worktrees: string[] = [];

  beforeEach(async () => {
    repo = await createTempRepo("arc-exit-");
    worktrees.length = 0;
    const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
    expect(init.exitCode).toBe(0);
    await commitAll(repo, "arc init");
  });

  afterEach(async () => {
    for (const wt of worktrees) {
      await git(repo, ["worktree", "remove", "--force", wt]).catch(() => undefined);
      await rm(wt, { recursive: true, force: true }).catch(() => undefined);
    }
    await cleanupTempDir(repo);
  });

  // -------------------------------------------------------------------------
  // arc decompose (CLI) — retire artifacts in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("arc decompose retires the origin's artifacts but defers branch + worktree teardown", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    expect(worktree).toBeDefined();
    if (worktree !== undefined) worktrees.push(worktree);
    const cutMap = await writeCutMap(repo, "mono", "mono", ["alpha", "beta"]);

    const result = await runArc(["decompose", "mono", "--cut-map", cutMap], repo);

    expect(result.exitCode).toBe(0);
    // Members scaffolded under the new cohort; origin meta removed from active/.
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/alpha/meta-alpha.md"))).toBe(true);
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/beta/meta-beta.md"))).toBe(true);
    expect(await pathExists(join(repo, ".arc/active/meta-mono.md"))).toBe(false);
    // Branch + worktree are NOT torn down in-verb — the output surfaces the post-action command.
    expect(await branchExists(repo, "plan/mono")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/arc teardown mono --force/);
  });

  // -------------------------------------------------------------------------
  // arc park@Planning (CLI) — relocate in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("arc park@Planning relocates to backlog/planned/ and defers branch + worktree teardown", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "solo", "linked");
    expect(worktree).toBeDefined();
    if (worktree !== undefined) worktrees.push(worktree);

    const result = await runArc(["park", "solo", "--reason", "pivoting to a dependency first"], repo);

    expect(result.exitCode).toBe(0);
    // Relocated to the parked tier; the plan branch + worktree linger for the post-action reap.
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(true);
    expect(await pathExists(join(repo, ".arc/active/meta-solo.md"))).toBe(false);
    expect(await branchExists(repo, "plan/solo")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/arc teardown solo --force/);
  });

  // -------------------------------------------------------------------------
  // arc teardown --force — the four silently-broken behaviors
  // -------------------------------------------------------------------------

  it("force-deletes an unmerged plan branch in the linked model (worktree removed)", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    // Retire the origin (remove its active/ meta) so it is un-shipped, then reap.
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitAll(repo, "retire origin mono");

    const result = await runArc(["teardown", "mono", "--force"], repo);

    expect(result.exitCode).toBe(0);
    // Unmerged branch force-deleted (the merged-safe path would have refused it).
    expect(await branchExists(repo, "plan/mono")).toBe(false);
    expect(worktree !== undefined && (await pathExists(worktree))).toBe(false);
  });

  it("switches the primary to base (no removal) in the in-place model", async () => {
    await scaffoldStartedWu(repo, "mono", "in-place");
    // Primary is checked out on plan/mono; retire the origin there.
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitAll(repo, "retire origin mono");

    const result = await runArc(["teardown", "mono", "--force"], repo);

    expect(result.exitCode).toBe(0);
    // The primary worktree is switched to base, never removed; the branch is reaped.
    expect(await pathExists(repo)).toBe(true);
    expect(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(await branchExists(repo, "plan/mono")).toBe(false);
  });

  it("locus-hops on a self-teardown: run from the linked worktree being removed", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitAll(repo, "retire origin mono");

    // Invoke from *inside* the worktree being torn down — the locus-hop must let the
    // process complete despite its cwd disappearing.
    const result = await runArc(["teardown", "mono", "--force"], worktree!);

    expect(result.exitCode).toBe(0);
    expect(await branchExists(repo, "plan/mono")).toBe(false);
    expect(await pathExists(worktree!)).toBe(false);
  });

  it("refuses to tear down a dirty worktree", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitAll(repo, "retire origin mono");
    // Leave uncommitted work in the linked worktree.
    await writeFile(join(worktree!, "dirty.txt"), "uncommitted\n");

    const result = await runArc(["teardown", "mono", "--force"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/dirty worktree|uncommitted/i);
    // Nothing reaped — the refusal is before any mutation.
    expect(await branchExists(repo, "plan/mono")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
  });
});
