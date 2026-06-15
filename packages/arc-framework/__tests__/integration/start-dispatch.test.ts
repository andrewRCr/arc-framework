/**
 * Integration coverage for `arc start`'s lifecycle-state dispatch against real
 * git worktrees. Exercises the dispatch routing, the executor binder, and the
 * real mutators end to end: create-new spawns a worktree, a backlog stub
 * graduates (the name-collision fix — an existing stub graduates, never
 * mis-scaffolds), the worktree-occupancy guard rejects a second active WU in one
 * worktree, and the already-live / terminal states refuse with direction.
 *
 * Git and the filesystem are real (temp repos + temp worktrees); the cores are
 * called directly so the assertions read the on-disk result.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdir, rm, writeFile, stat, readFile, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";

import { runCreateNew, runGraduate, resolveStartDispatch } from "../../src/commands/start.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";
import { resolveWorktreeLocation } from "../../src/lib/git/worktree-location.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { buildLifecycleIndex } from "../../src/lib/work-unit/lifecycle-index.js";
import type { UserIOContext } from "../../src/commands/user/types.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

const IDENTITY = "test-user";

/** A minimal managed meta for a stub at a given State. */
function metaFor(slug: string, state: string, branch: string, cls = "Light"): string {
  return (
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`${state}\` | \`${IDENTITY}\` | \`${branch}\` | \`${cls}\` | \`P1\` |\n\n` +
    `- **Cohort:** [none]\n- **Depends On:** [none]\n\n` +
    `- **Last Completed:** [none]\n- **Next Task:** [none]\n- **Blockers:** [none]\n\n` +
    `- **Next Action:** begin.\n\n---\n`
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

interface Harness {
  repo: string;
  io: UserIOContext;
  /** Absolute `worktree.location_template` — lands spawns beside the repo (in the temp parent). */
  locationTemplate: string;
  spawned: string[];
}

/** A real git repo on `main` with `.arc/` scaffolding and an initial commit. */
async function setup(): Promise<Harness> {
  const repo = await createTempRepo("arc-start-dispatch-");
  const locationTemplate = join(dirname(repo), "{repo}.{branch}");
  await mkdir(join(repo, ".arc", "active"), { recursive: true });
  await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
  await mkdir(join(repo, ".arc", "system"), { recursive: true });
  await writeFile(
    join(repo, ".arc", "system", "arc-config.yml"),
    `branch.base: main\nbranch.protection: partial\nworktree.location_template: ${locationTemplate}\n`,
  );
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "scaffold"], { cwd: repo });
  return { repo, io: { ...createUserIOContext(), exec: makeGitExec(repo) }, locationTemplate, spawned: [] };
}

/** Commit a stub meta into a lifecycle tier so `git mv` can relocate it. */
async function commitMeta(repo: string, relDir: string, slug: string, state: string, branch: string): Promise<void> {
  const dir = join(repo, ".arc", relDir);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${slug}.md`), metaFor(slug, state, branch));
  await execFileAsync("git", ["add", "-A"], { cwd: repo });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", `stub ${slug}`], { cwd: repo });
}

async function indexOf(repo: string): ReturnType<typeof buildLifecycleIndex> {
  return buildLifecycleIndex({
    cwd: repo,
    fs: {
      readdir: (p) => readdir(p, { withFileTypes: true }),
      readFile: (p) => readFile(p, "utf8"),
    },
  });
}

describe("arc start dispatch — against real worktrees", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await setup();
  });

  afterEach(async () => {
    for (const wt of h.spawned) {
      await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: h.repo }).catch(() => {});
      await rm(wt, { recursive: true, force: true });
    }
    await cleanupTempDir(h.repo);
  });

  it("create-new: spawns a real worktree on a new plan/ branch with a scaffolded meta + marker", async () => {
    const wt = resolveWorktreeLocation({ template: h.locationTemplate, repo: basename(h.repo), branch: "plan/alpha" });
    h.spawned.push(wt);

    const outcome = await runCreateNew(
      { io: h.io, internalTemplateDir: getInternalTemplatePath() },
      { worktreePath: h.repo, identity: IDENTITY, name: "alpha" },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.branch).toBe("plan/alpha");
    expect(await pathExists(wt)).toBe(true);
    const record = parseMetaRecord(await readFile(join(wt, ".arc", "active", "meta-alpha.md"), "utf8"));
    expect(record.State).toBe("Planning");
    expect(record.Branch).toBe("plan/alpha");
    expect((await readWorktreeMarker(wt)).kind).toBe("present");
  });

  it("graduate: an existing backlog stub graduates onto its branch (never mis-scaffolds)", async () => {
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");
    const wt = resolveWorktreeLocation({ template: h.locationTemplate, repo: basename(h.repo), branch: "plan/widget" });
    h.spawned.push(wt);

    // The name collision routes to graduate, not create-new.
    const dispatch = resolveStartDispatch(await indexOf(h.repo), "widget");
    expect(dispatch.arm).toBe("graduate");

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      {
        name: "widget",
        cls: "Light",
        baseBranch: "main",
        locationTemplate: h.locationTemplate,
        repo: basename(h.repo),
        spawningIdentity: IDENTITY,
      },
    );

    expect(result.status).toBe("graduated");
    // The stub relocated `backlog → active` (real `git mv`) — not a fresh scaffold over it.
    expect(await pathExists(join(h.repo, ".arc", "active", "meta-widget.md"))).toBe(true);
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(false);
    // The worktree spawned on the cut branch.
    expect(await pathExists(wt)).toBe(true);
    // The `reconcile-status-user` side-effect rendered for real (local-only) and wrote STATUS.USER.
    const statusUserPath = join(h.repo, ".arc", "user", IDENTITY, "STATUS.USER.md");
    expect(await pathExists(statusUserPath)).toBe(true);
    expect(await readFile(statusUserPath, "utf8")).toContain("## In Flight");
  });

  it("worktree-occupancy: graduating into a worktree already holding an active WU is rejected", async () => {
    // An active WU already occupies the worktree on a different branch.
    await commitMeta(h.repo, "active", "incumbent", "Active", "feat/incumbent");
    await commitMeta(h.repo, "backlog/planned/widget", "widget", "Planning", "[none]");

    const result = await runGraduate(
      buildExecutorContext({ cwd: h.repo, io: h.io, identity: IDENTITY, teamMode: false, internalTemplateDir: getInternalTemplatePath() }),
      {
        name: "widget",
        cls: "Light",
        baseBranch: "main",
        locationTemplate: h.locationTemplate,
        repo: basename(h.repo),
        spawningIdentity: IDENTITY,
      },
    );

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/active work unit|occupanc|one active/i);
    // No relocation happened — the stub is untouched.
    expect(await pathExists(join(h.repo, ".arc", "backlog", "planned", "widget", "meta-widget.md"))).toBe(true);
  });

  it("refuse: an already-Active WU is refused as occupied (no mutation)", async () => {
    await commitMeta(h.repo, "active", "solo", "Active", "feat/solo");

    const dispatch = resolveStartDispatch(await indexOf(h.repo), "solo");
    expect(dispatch.arm).toBe("refuse");
    if (dispatch.arm !== "refuse") return;
    expect(dispatch.reason).toMatch(/occupied|already active/i);
  });
});
