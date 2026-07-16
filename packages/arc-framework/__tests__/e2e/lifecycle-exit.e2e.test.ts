/**
 * E2E for the work-unit exit choreography through the built CLI — `arc decompose`,
 * `arc park`, `arc abandon`, and the generalized `arc teardown --force`, in real git
 * repos across the **in-place** and **linked** worktree models.
 *
 * This is the coverage the unit/integration tiers structurally could not give: the
 * earlier tests drove the verb *cores* with hand-fed cross-worktree inputs the CLI
 * never generates (origin committed to `main` + a separate clean worktree), so the
 * self-teardown configuration the CLI actually produces was never exercised and a
 * teardown-ordering defect shipped uncaught. These tests drive the verbs through the
 * CLI seam and assert on-disk outcomes — never on core call-args.
 *
 * The post-reframe contract under test: `decompose` / `park@Planning` /
 * `abandon@{Planning,Active}` retire (remove / relocate) the origin's artifacts in-verb
 * but defer its branch + worktree teardown out-of-band to a post-action
 * `arc teardown <slug> --force`. The force mode's four behaviors — dirty-tree refusal,
 * self-teardown locus-hop, in-place primary-switch, and unmerged force-delete — are
 * asserted here in the real repos that produce them.
 */

import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

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

/** Run a real Git commit and retain hook output on refusal. */
async function commitAttempt(cwd: string, message: string): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFileAsync("git", ["commit", "-m", message], { cwd });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number; stdout?: string; stderr?: string };
    return {
      exitCode: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
}

/** Install the shipped validator as the temp repository's real pre-commit hook. */
async function installDecomposeRecordHook(repo: string): Promise<void> {
  const hooks = join(repo, ".git", "arc-test-hooks");
  const hook = join(hooks, "pre-commit");
  const cli = join(packageRoot, "dist", "cli.js");
  await mkdir(hooks, { recursive: true });
  await writeFile(hook, `#!/bin/sh\nexec "${process.execPath}" "${cli}" hook-validate-decompose-record\n`);
  await chmod(hook, 0o755);
  await git(repo, ["config", "core.hooksPath", hooks]);
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

/** Produce one committed, genuine park transition while leaving base conflict-free. */
async function scaffoldCommittedParkTransition(
  repo: string,
  slug: string,
): Promise<{ worktree: string; transition: string; receiptFile: string }> {
  const { worktree } = await scaffoldStartedWu(repo, slug, "linked");
  expect(worktree).toBeDefined();

  // The planning branch owns the live artifacts; the base has no competing
  // projection of this slug when the transition is materialized.
  await rm(join(repo, `.arc/active/meta-${slug}.md`));
  await rm(join(repo, `.arc/active/draft-${slug}.md`));
  await commitAll(repo, `remove in-flight ${slug} from base`);

  const park = await runArc(
    ["park", slug, "--reason", "pivoting to a dependency first"],
    worktree!,
  );
  expect(park.exitCode, park.stdout + park.stderr).toBe(0);
  await commitAll(worktree!, `park ${slug}`);
  const transition = await git(worktree!, ["rev-parse", "HEAD"]);
  const receiptFile = (await readdir(join(worktree!, ".arc/.internal/retirement-receipts")))[0];
  expect(receiptFile).toBeDefined();
  return { worktree: worktree!, transition, receiptFile: receiptFile! };
}

/** Author a symmetric two-member cut-map JSON for `origin`, written to `<repo>/cut.json`. */
async function writeCutMap(repo: string, origin: string, cohort: string, members: string[]): Promise<string> {
  const sourcePath = `.arc/active/draft-${origin}.md`;
  const sourceId = canonicalDigest({
    schemaVersion: 2,
    sourcePath,
    sourceLocator: { artifact: `draft-${origin}.md`, kind: "preamble" },
  });
  const cut = {
    schemaVersion: 2,
    origin: { slug: origin, phase: "Planning", location: "active" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort,
    entries: [
      ...members.map((slug) => ({
        kind: "new-member",
        destinationId: slug,
        slug,
        workClass: "Light",
      })),
      { kind: "cohort-coordination", destinationId: "coordination", cohort },
    ],
    internalEdges: [],
    sourceAllocations: [{
      sourceId,
      disposition: {
        kind: "target",
        destinationId: "coordination",
        targetLocator: { artifact: `cohort-${basename(cohort)}.md`, kind: "preamble" },
      },
    }],
    incomingEdges: [],
    outgoingEdges: [],
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

  it("arc decompose prepares, refuses premature commit, and finalizes one recoverable receipt", async () => {
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

    const output = result.stdout + result.stderr;
    const receiptId = /sha256:[0-9a-f]{64}/u.exec(output)?.[0];
    expect(receiptId).toBeDefined();
    if (receiptId === undefined) return;
    const receiptPath = join(
      repo,
      ".arc/.internal/retirement-receipts",
      `${receiptId.replace(":", "-")}.json`,
    );
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toMatchObject({ kind: "prepared-decompose" });

    await installDecomposeRecordHook(repo);
    const premature = await commitAttempt(repo, "premature decompose");
    expect(premature.exitCode).not.toBe(0);
    expect(premature.stdout + premature.stderr).toContain("decompose record is prepared but not finalized");

    const incomplete = await runArc(["decompose", "mono", "--finalize", receiptId], repo);
    expect(incomplete.exitCode).not.toBe(0);
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toMatchObject({ kind: "prepared-decompose" });

    const cohortDoc = join(repo, ".arc/backlog/planned/mono/cohort-mono.md");
    await writeFile(cohortDoc, "# Cohort: mono\n\nPurpose: split the origin safely.\n");
    await git(repo, ["add", "--", ".arc/backlog/planned/mono/cohort-mono.md"]);
    const finalized = await runArc(["decompose", "mono", "--finalize", receiptId], repo);
    expect(finalized.exitCode, finalized.stdout + finalized.stderr).toBe(0);
    expect(JSON.parse(await readFile(receiptPath, "utf8"))).toMatchObject({ transition: "decompose" });

    const committed = await commitAttempt(repo, "finalized decompose");
    expect(committed.exitCode, committed.stdout + committed.stderr).toBe(0);
  });

  // -------------------------------------------------------------------------
  // arc park@Planning (CLI) — relocate in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("arc park@Planning relocates to backlog/planned/ and defers branch + worktree teardown", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "solo", "linked");
    expect(worktree).toBeDefined();
    if (worktree !== undefined) worktrees.push(worktree);

    const result = await runArc(
      ["park", "solo", "--reason", "pivoting to a dependency first"],
      worktree!,
    );

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    // Relocation and its receipt are staged together on the planning branch; the
    // branch + worktree linger for the post-action reap.
    expect(await pathExists(join(worktree!, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(true);
    expect(await pathExists(join(worktree!, ".arc/active/meta-solo.md"))).toBe(false);
    const receiptDir = join(worktree!, ".arc/.internal/retirement-receipts");
    const receiptFiles = await readdir(receiptDir);
    expect(receiptFiles).toHaveLength(1);
    const staged = await git(worktree!, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(".arc/backlog/planned/solo/meta-solo.md");
    expect(staged).toContain(`.arc/.internal/retirement-receipts/${receiptFiles[0]}`);
    expect(await branchExists(repo, "plan/solo")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/arc teardown solo --force/);
  });

  it("arc park --land stages the exact planning result on a partial-protection base", async () => {
    const { worktree, transition, receiptFile } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode, land.stdout + land.stderr).toBe(0);
    const plannedPath = ".arc/backlog/planned/solo/meta-solo.md";
    const receiptPath = `.arc/.internal/retirement-receipts/${receiptFile}`;
    const staged = await git(repo, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(plannedPath);
    expect(staged).toContain(receiptPath);
    expect(await readFile(join(repo, plannedPath))).toEqual(await readFile(join(worktree!, plannedPath)));
    expect(await readFile(join(repo, receiptPath))).toEqual(await readFile(join(worktree!, receiptPath)));
    expect(await git(repo, ["rev-parse", `:${plannedPath}`])).toBe(
      await git(worktree, ["rev-parse", `${transition}:${plannedPath}`]),
    );
    expect(await git(repo, ["rev-parse", `:${receiptPath}`])).toBe(
      await git(worktree, ["rev-parse", `${transition}:${receiptPath}`]),
    );
  });

  it("arc park --land refuses a non-tip transition without writing the base", async () => {
    const { worktree, transition, receiptFile } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await writeFile(join(worktree, "later.txt"), "later\n");
    await commitAll(worktree, "advance planning tip");

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/not the exact local tip/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
    expect(await pathExists(join(repo, `.arc/.internal/retirement-receipts/${receiptFile}`))).toBe(false);
  });

  it("arc park --land refuses a planning branch without a registered owner", async () => {
    const { worktree, transition, receiptFile } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await git(repo, ["worktree", "remove", worktree]);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/not owned by a registered worktree/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
    expect(await pathExists(join(repo, `.arc/.internal/retirement-receipts/${receiptFile}`))).toBe(false);
  });

  it("arc park --land refuses a broken direct-transition relation", async () => {
    const { worktree, receiptFile } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await writeFile(join(worktree, "later.txt"), "later\n");
    await commitAll(worktree, "advance beyond the transition");
    const descendant = await git(worktree, ["rev-parse", "HEAD"]);

    const land = await runArc(["park", "solo", "--land", descendant], repo);

    expect(land.exitCode).toBe(1);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
    expect(await pathExists(join(repo, `.arc/.internal/retirement-receipts/${receiptFile}`))).toBe(false);
  });

  it("arc park --land refuses an outside transition path without writing the base", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "solo", "linked");
    expect(worktree).toBeDefined();
    worktrees.push(worktree!);
    await rm(join(repo, ".arc/active/meta-solo.md"));
    await rm(join(repo, ".arc/active/draft-solo.md"));
    await commitAll(repo, "remove in-flight solo from base");
    const park = await runArc(["park", "solo", "--reason", "pivoting"], worktree!);
    expect(park.exitCode, park.stdout + park.stderr).toBe(0);
    await writeFile(join(worktree!, "outside.txt"), "outside\n");
    await commitAll(worktree!, "park solo with an outside path");
    const transition = await git(worktree!, ["rev-parse", "HEAD"]);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/outside its result/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  it("arc park --land refuses a conflicting base slug without a partial write", async () => {
    const { worktree, transition, receiptFile } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    const conflictDir = join(repo, ".arc/backlog/provisional/solo");
    await mkdir(conflictDir, { recursive: true });
    await writeFile(join(conflictDir, "meta-solo.md"), startedMeta("solo"));

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/conflicting work-unit result/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
    expect(await pathExists(join(repo, `.arc/.internal/retirement-receipts/${receiptFile}`))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // arc abandon (CLI) — remove artifacts in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("arc abandon refuses a started work unit outside its recorded source branch", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    expect(worktree).toBeDefined();
    if (worktree !== undefined) worktrees.push(worktree);

    const result = await runArc(["abandon", "mono", "--yes"], repo);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/must run from the source branch/);
    expect(await pathExists(join(repo, ".arc/active/meta-mono.md"))).toBe(true);
    expect(await pathExists(join(worktree!, ".arc/active/meta-mono.md"))).toBe(true);
  });

  it("arc abandon removes the started WU's artifacts but defers branch + worktree teardown", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    expect(worktree).toBeDefined();
    if (worktree !== undefined) worktrees.push(worktree);

    const result = await runArc(["abandon", "mono", "--yes"], worktree!);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    // Artifacts and the exact receipt are staged together on the retiring branch;
    // the branch + worktree linger for the post-action reap.
    expect(await pathExists(join(worktree!, ".arc/active/meta-mono.md"))).toBe(false);
    const receiptDir = join(worktree!, ".arc/.internal/retirement-receipts");
    const receiptFiles = await readdir(receiptDir);
    expect(receiptFiles).toHaveLength(1);
    const staged = await git(worktree!, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(".arc/active/meta-mono.md");
    expect(staged).toContain(`.arc/.internal/retirement-receipts/${receiptFiles[0]}`);
    expect(await branchExists(repo, "plan/mono")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/arc teardown mono --force/);
  });

  it("arc abandon → commit → teardown --force reaps the branch + worktree (linked)", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);

    const abandon = await runArc(["abandon", "mono", "--yes"], worktree!);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    // The removal is staged-but-uncommitted (a dirty tree); commit it so the
    // post-action teardown reaps from a clean worktree, per the ceremony.
    await commitAll(worktree!, "abandon mono");

    const teardown = await runArc(["teardown", "mono", "--force"], worktree!);

    expect(teardown.exitCode).toBe(0);
    expect(await branchExists(repo, "plan/mono")).toBe(false);
    expect(await pathExists(worktree!)).toBe(false);
  });

  it("arc abandon → commit → teardown --force switches the primary to base (in-place)", async () => {
    await scaffoldStartedWu(repo, "mono", "in-place");

    const abandon = await runArc(["abandon", "mono", "--yes"], repo);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    await commitAll(repo, "abandon mono");

    const teardown = await runArc(["teardown", "mono", "--force"], repo);

    expect(teardown.exitCode).toBe(0);
    // The primary is switched to base (never removed); the unmerged branch is reaped.
    expect(await pathExists(repo)).toBe(true);
    expect(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(await branchExists(repo, "plan/mono")).toBe(false);
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
