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
 * self-husk preservation, in-place primary-switch, and authorized exact-ref cleanup — are
 * asserted here in the real repos that produce them.
 */

import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  readdir,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { assertEditorDocumentsProvisioned, resetEditorDocumentsProvisioning } from "./editor-document-helpers.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import {
  runArc,
  runArcNoTty,
  createTempRepo,
  cleanupTempDir,
  removeGitBackedDir,
  unwrapPresentationOutput,
} from "./helpers.js";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

/** Run a git command in `cwd`, returning trimmed stdout. */
async function git(
  cwd: string,
  args: string[],
  env?: Record<string, string>,
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  return stdout.trim();
}

/** Stage everything and commit, bypassing hooks (scaffolding, not a hook test). */
async function commitFixtureBypassingHooks(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message]);
}

/** Run a real Git commit and retain hook output on refusal. */
async function commitAttempt(
  cwd: string,
  message: string,
  env?: Record<string, string>,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
}> {
  try {
    const result = await execFileAsync("git", ["commit", "-m", message], {
      cwd,
      ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
    });
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

/** Supply the built CLI where installed hooks expect the global `arc` executable. */
async function createBuiltCliHookPath(): Promise<{ directory: string; env: Record<string, string> }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-built-cli-"));
  const executable = join(directory, "arc");
  const cli = join(packageRoot, "dist", "cli.js");
  await writeFile(executable, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
  await chmod(executable, 0o755);
  return {
    directory,
    env: {
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      ARC_TSX_LOADER: import.meta.resolve("tsx"),
    },
  };
}

/**
 * Make the framework repository's hook validators available in the isolated
 * self-hosting fixture without replacing the installed hook chain.
 */
async function installFixtureHookRuntime(repo: string): Promise<void> {
  await mkdir(join(repo, "packages"), { recursive: true });
  await symlink(packageRoot, join(repo, "packages", "arc-framework"), "dir");
  await symlink(
    join(packageRoot, "arc", "system", ".internal", "scripts", "validate-links.sh"),
    join(repo, ".arc", "system", ".internal", "scripts", "validate-links.sh"),
    "file",
  );
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
function startedMeta(slug: string, cohort = "[none]"): string {
  return (
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `| --------- | --------- | ----------- | --------- | ------------ |\n` +
    `| \`Planning\` | \`test-user\` | \`plan/${slug}\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Cohort:** ${cohort}\n` +
    `- **Depends On:** [none]\n\n` +
    `- **Origin:** [internal]\n` +
    `- **Design:** \`draft-${slug}.md\`\n\n---\n`
  );
}

/** A minimal active WU whose preserved branch can be parked from the base checkout. */
function activeMeta(slug: string): string {
  return startedMeta(slug)
    .replace("`Planning`", "`Active`")
    .replace(`\`plan/${slug}\``, `\`feat/${slug}\``);
}

/** Produce the real cross-worktree shape consumed by park@Active. */
async function scaffoldActiveWu(repo: string, slug: string): Promise<{ worktree: string; branch: string }> {
  const branch = `feat/${slug}`;
  const dir = join(repo, ".arc", "active");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${slug}.md`), activeMeta(slug));
  await writeFile(join(dir, `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** active work\n\n---\n`);
  await commitFixtureBypassingHooks(repo, `scaffold active ${slug}`);

  await git(repo, ["branch", branch]);
  const worktree = join(dirname(repo), `${basename(repo)}-${slug}-active`);
  await git(repo, ["worktree", "add", worktree, branch]);
  await writeFile(
    join(worktree, ".arc", "active", `draft-${slug}.md`),
    `# Draft: ${slug}\n\n- **Purpose:** preserved active work\n\n---\n`,
  );
  await commitFixtureBypassingHooks(worktree, `advance ${branch}`);

  await rm(join(repo, ".arc", "active", `meta-${slug}.md`));
  await rm(join(repo, ".arc", "active", `draft-${slug}.md`));
  await commitFixtureBypassingHooks(repo, `remove active ${slug} projection from base`);
  return { worktree, branch };
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
  cohort = "[none]",
): Promise<{ worktree?: string }> {
  const dir = join(repo, ".arc", "active");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `meta-${slug}.md`), startedMeta(slug, cohort));
  await writeFile(join(dir, `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** —\n\n---\n`);
  await commitFixtureBypassingHooks(repo, `scaffold origin ${slug}`);

  // Cut the plan branch and give it an unmerged commit (not reachable from main).
  if (model === "in-place") {
    await git(repo, ["checkout", "-b", `plan/${slug}`]);
    await writeFile(join(repo, ".arc", "active", `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** drafting\n\n---\n`);
    await commitFixtureBypassingHooks(repo, `wip on plan/${slug}`);
    return {};
  }
  // linked: create the branch with an unmerged commit in a linked worktree.
  await git(repo, ["branch", `plan/${slug}`]);
  const worktree = join(dirname(repo), `${basename(repo)}-${slug}`);
  await git(repo, ["worktree", "add", worktree, `plan/${slug}`]);
  await writeFile(join(worktree, ".arc", "active", `draft-${slug}.md`), `# Draft: ${slug}\n\n- **Purpose:** drafting\n\n---\n`);
  await commitFixtureBypassingHooks(worktree, `wip on plan/${slug}`);
  return { worktree };
}

/** Produce one committed, genuine park transition while leaving base conflict-free. */
async function scaffoldCommittedParkTransition(
  repo: string,
  slug: string,
  cohort = "[none]",
  options: {
    fault?: "planned-content" | "incomplete" | "source-survivor" | "invalid-roadmap";
  } = {},
): Promise<{ worktree: string; transition: string }> {
  const { worktree } = await scaffoldStartedWu(repo, slug, "linked", cohort);
  expect(worktree).toBeDefined();

  // The planning branch owns the live artifacts; the base has no competing
  // projection of this slug when the transition is materialized.
  await rm(join(repo, `.arc/active/meta-${slug}.md`));
  await rm(join(repo, `.arc/active/draft-${slug}.md`));
  await commitFixtureBypassingHooks(repo, `remove in-flight ${slug} from base`);

  const park = await runArc(
    ["park", slug, "--reason", "pivoting to a dependency first"],
    worktree!,
  );
  expect(park.exitCode, park.stdout + park.stderr).toBe(0);
  const plannedDir = cohort === "[none]"
    ? join(worktree!, ".arc/backlog/planned", slug)
    : join(worktree!, ".arc/backlog/planned", cohort, slug);
  const plannedDraft = join(plannedDir, `draft-${slug}.md`);
  if (options.fault === "planned-content") await writeFile(plannedDraft, "# edited after relocation\n");
  if (options.fault === "incomplete") await rm(plannedDraft);
  if (options.fault === "source-survivor") {
    const activeDir = join(worktree!, ".arc/active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(join(activeDir, `draft-${slug}.md`), await readFile(plannedDraft));
  }
  if (options.fault === "invalid-roadmap") {
    await writeFile(join(worktree!, ".arc/backlog/ROADMAP.md"), "# forged roadmap\n");
  }
  await commitFixtureBypassingHooks(worktree!, `park ${slug}`);
  const transition = await git(worktree!, ["rev-parse", "HEAD"]);
  return { worktree: worktree!, transition };
}

/** Encode the public canonical JSON wire shape without importing CLI internals. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical fixture JSON requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter((entry) => entry[1] !== undefined)
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  throw new Error(`Unsupported canonical fixture value: ${typeof value}.`);
}

interface PublicStarterMap {
  schemaVersion: 3;
  machine: {
    source: {
      origin: string;
      kind: string;
      logicalBranch: string;
      ref: string;
      head: string;
    };
    resultBase: { ref: string; head: string };
    planningProfile: { kind: string; sourceDesign: string[] };
    sourceUnits: Array<{
      sourceId: string;
      sourceLocator: { artifact: string; [key: string]: unknown };
    }>;
    incomingEdges: Array<{ edgeId: string }>;
    outgoingEdges: Array<{ edgeId: string }>;
  };
}

function completedSymmetricMap(starter: PublicStarterMap): unknown {
  const destinations = [
    { kind: "new-member", destinationId: "blocked-leaf", slug: "blocked-leaf", workClass: "Light" },
    { kind: "new-member", destinationId: "selected-leaf", slug: "selected-leaf", workClass: "Heavy" },
    { kind: "new-member", destinationId: "unselected-leaf", slug: "unselected-leaf", workClass: "Light" },
  ];
  const destinationFor = (artifact: string): string =>
    artifact.endsWith("-prd.md")
      ? "selected-leaf"
      : artifact.endsWith("-rfc.md")
        ? "blocked-leaf"
        : "unselected-leaf";
  const targetArtifact = (artifact: string, destinationId: string): string =>
    artifact.replace("origin", destinationId);
  return {
    schemaVersion: 3,
    machine: starter.machine,
    authoring: {
      shape: "symmetric",
      placement: { kind: "cohort", cohort: "origin" },
      destinations,
      internalEdges: [{ from: "blocked-leaf", to: "selected-leaf" }],
      externalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit) => {
        const destinationId = destinationFor(unit.sourceLocator.artifact);
        return {
          sourceId: unit.sourceId,
          ownership: "destination-owned",
          disposition: {
            kind: "target",
            destinationId,
            targetLocator: {
              ...unit.sourceLocator,
              artifact: targetArtifact(unit.sourceLocator.artifact, destinationId),
            },
          },
        };
      }),
      incomingDispositions: starter.machine.incomingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "replace", replacementTargets: ["selected-leaf"] },
      })),
      outgoingDispositions: starter.machine.outgoingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "targets", targets: ["selected-leaf"] },
      })),
    },
  };
}

async function repositorySnapshot(cwd: string): Promise<{
  head: string;
  heads: string;
  indexTree: string;
  status: string;
  worktrees: string;
  claims: string[];
}> {
  const commonDir = resolve(cwd, await git(cwd, ["rev-parse", "--git-common-dir"]));
  let claims: string[] = [];
  try {
    claims = (await readdir(join(commonDir, "arc", "transient-claims"))).sort();
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  return {
    head: await git(cwd, ["rev-parse", "HEAD"]),
    heads: await git(cwd, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]),
    indexTree: await git(cwd, ["write-tree"]),
    status: await git(cwd, ["status", "--porcelain=v1", "--untracked-files=all"]),
    worktrees: await git(cwd, ["worktree", "list", "--porcelain"]),
    claims,
  };
}

describe("lifecycle exit choreography (CLI seam)", () => {
  let repo: string;
  const worktrees: string[] = [];
  const externalDirs: string[] = [];

  beforeEach(async () => {
    repo = await createTempRepo("arc-exit-");
    worktrees.length = 0;
    externalDirs.length = 0;
    const init = await runArc(
      ["init", "--yes", "--name", "test-project", "--pm-mode", "arc-in-git", "--tools", "codex"],
      repo,
    );
    expect(init.exitCode).toBe(0);
    await commitFixtureBypassingHooks(repo, "arc init");
    const origin = await mkdtemp(join(tmpdir(), "arc-exit-origin-"));
    externalDirs.push(origin);
    await git(origin, ["init", "--bare", "--initial-branch=main"]);
    await git(repo, ["remote", "add", "origin", origin]);
    await git(repo, ["push", "-u", "origin", "main"]);
  });

  afterEach(async () => {
    const errors: unknown[] = [];
    for (const wt of worktrees) {
      await git(repo, ["worktree", "remove", "--force", wt]).catch(() => undefined);
      try {
        await removeGitBackedDir(wt);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      await cleanupTempDir(repo);
    } catch (error) {
      errors.push(error);
    }
    for (const path of externalDirs.reverse()) {
      try {
        await removeGitBackedDir(path);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, "Lifecycle-exit fixture cleanup failed.");
    }
  });

  // -------------------------------------------------------------------------
  // arc decompose (CLI) — retire artifacts in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("builds one exact started-planning decomposition fixture through the installed surface", async () => {
    const remote = await mkdtemp(join(tmpdir(), "arc-decompose-remote-"));
    externalDirs.push(remote);
    await execFileAsync("git", ["init", "--bare", remote]);
    await git(repo, ["remote", "set-url", "origin", remote]);

    const hookPath = await createBuiltCliHookPath();
    externalDirs.push(hookPath.directory);
    await installFixtureHookRuntime(repo);
    const configPath = join(repo, ".arc", "system", "arc-config.yml");
    await writeFile(
      configPath,
      (await readFile(configPath, "utf8")).replace(
        "branch.protection: partial",
        "branch.protection: full",
      ),
    );
    await writeFile(join(repo, "fixture-control.txt"), "installed hook control\n");
    await git(repo, ["switch", "-c", "chore/canonical-decompose-fixture"]);
    await git(repo, ["add", "-A"]);
    const control = await commitAttempt(
      repo,
      "chore(test): Configure canonical lifecycle fixture\n\n"
        + "Context: standalone (maintenance)",
      hookPath.env,
    );
    expect(control.exitCode, control.stdout + control.stderr).toBe(0);
    expect(control.stdout + control.stderr).toContain("Pre-commit checks PASSED");
    await git(repo, ["switch", "main"]);
    await git(repo, ["merge", "--ff-only", "chore/canonical-decompose-fixture"]);
    await git(repo, ["push", "-u", "origin", "main"], hookPath.env);

    expect(await git(repo, ["config", "--get", "core.hooksPath"]))
      .toBe(".arc/system/.internal/githooks");
    expect(await readFile(configPath, "utf8")).toContain("branch.base: main");
    for (const hook of ["pre-commit", "commit-msg", "pre-push"]) {
      expect(await pathExists(join(repo, ".arc", "system", ".internal", "githooks", hook))).toBe(true);
    }
    expect(await readFile(configPath, "utf8")).toContain("branch.protection: full");

    await git(repo, ["switch", "-c", "chore/create-origin-predecessor"]);
    const stubbed = await runArcNoTty(
      [
        "stub",
        "origin",
        "--commitment",
        "planned",
        "--priority",
        "P1",
        "--class",
        "Heavy",
        "--design",
        "draft-origin.md",
      ],
      repo,
      { env: hookPath.env },
    );
    expect(stubbed.exitCode, stubbed.stdout + stubbed.stderr).toBe(0);
    await writeFile(
      join(repo, ".arc", "backlog", "planned", "origin", "draft-origin.md"),
      "# Draft: origin\n\n- **Purpose:** Split the original concern.\n\n---\n",
    );
    await git(repo, ["add", "-A"]);
    const predecessorCommit = await commitAttempt(
      repo,
      "chore(test): Create planned origin predecessor\n\n"
        + "Context: standalone (planning)",
      hookPath.env,
    );
    expect(predecessorCommit.exitCode, predecessorCommit.stdout + predecessorCommit.stderr).toBe(0);
    await git(repo, ["switch", "main"]);
    await git(repo, ["merge", "--ff-only", "chore/create-origin-predecessor"]);
    await git(repo, ["push", "origin", "main"], hookPath.env);
    const baseHead = await git(repo, ["rev-parse", "main"]);
    const predecessorPath = ".arc/backlog/planned/origin/meta-origin.md";
    const predecessorBytes = await git(repo, ["show", `main:${predecessorPath}`]);

    await resetEditorDocumentsProvisioning(repo);
    const started = await runArcNoTty(
      ["start", "origin", "--yes"],
      repo,
      { timeout: 60_000, env: hookPath.env },
    );
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    const sourceWorktree = `${repo}.origin`;
    worktrees.push(sourceWorktree);
    await assertEditorDocumentsProvisioned(sourceWorktree);
    expect(unwrapPresentationOutput(started.stdout)).toContain(sourceWorktree);
    expect(await pathExists(sourceWorktree)).toBe(true);

    const sourceMetaPath = join(sourceWorktree, ".arc", "active", "meta-origin.md");
    const sourceMeta = (await readFile(sourceMetaPath, "utf8"))
      .replace(
        /^- \*\*Design:\*\*.*$/mu,
        "- **Design:** `spec-origin-prd.md`, `spec-origin-rfc.md`",
      )
      .replace(/^- \*\*Task List:\*\*.*$/mu, "- **Task List:** `tasks-origin.md`")
      .replace(/^- \*\*Current Workflow:\*\*.*$/mu, "- **Current Workflow:** `generate-tasks`")
      .replace(/^- \*\*Next Action:\*\*.*$/mu, "- **Next Action:** Begin generate-tasks");
    await writeFile(sourceMetaPath, sourceMeta);
    await rm(join(sourceWorktree, ".arc", "active", "draft-origin.md"));
    await writeFile(join(sourceWorktree, ".arc", "active", "spec-origin-prd.md"), [
      "# Spec: Origin PRD",
      "",
      "## Context",
      "",
      "Separate the planning, execution, and operating concerns.",
      "",
      "## Requirements",
      "",
      "Preserve one exact publication authority across the split.",
      "",
      "---",
      "",
    ].join("\n"));
    await writeFile(join(sourceWorktree, ".arc", "active", "spec-origin-rfc.md"), [
      "# Spec: Origin RFC",
      "",
      "## Design",
      "",
      "Publish three independently addressable leaves under one cohort.",
      "",
      "## Constraints",
      "",
      "Keep the selected launch path distinct from readiness.",
      "",
      "---",
      "",
    ].join("\n"));
    await writeFile(
      join(sourceWorktree, ".arc", "active", "tasks-origin.md"),
      "# Tasks: origin\n",
    );
    await git(sourceWorktree, ["add", "-A"]);
    const planningCommit = await commitAttempt(
      sourceWorktree,
      "feat(test): Author paired origin planning\n\n"
        + "Context: standalone (planning)",
      hookPath.env,
    );
    expect(planningCommit.exitCode, planningCommit.stdout + planningCommit.stderr).toBe(0);
    await git(sourceWorktree, ["push"], hookPath.env);
    const sourceHead = await git(sourceWorktree, ["rev-parse", "HEAD"]);

    expect(await git(repo, ["branch", "--show-current"])).toBe("main");
    expect(await git(sourceWorktree, ["branch", "--show-current"])).toBe("plan/origin");
    expect(await git(repo, ["rev-parse", "main"])).toBe(baseHead);
    expect(await git(repo, ["merge-base", "main", "plan/origin"])).toBe(baseHead);
    expect(await git(repo, ["show", `main:${predecessorPath}`])).toBe(predecessorBytes);
    expect(await git(repo, ["show", "plan/origin:.arc/active/meta-origin.md"])).toBe(sourceMeta.trim());
    await expect(git(repo, ["cat-file", "-e", "main:.arc/active/spec-origin-prd.md"]))
      .rejects.toThrow();
    const registered = await git(repo, ["worktree", "list", "--porcelain"]);
    expect(registered).toContain(`worktree ${sourceWorktree}`);
    expect(registered).toContain("branch refs/heads/plan/origin");
    expect(await branchExists(repo, "chore/decompose-origin")).toBe(false);
    expect((await repositorySnapshot(repo)).claims).toEqual([]);

    const initialBaseBefore = await repositorySnapshot(repo);
    const initialFromBase = await runArcNoTty(
      ["decompose", "origin", "--preflight"],
      repo,
      { env: hookPath.env },
    );
    const initialBaseAfter = await repositorySnapshot(repo);
    expect(initialFromBase.exitCode, initialFromBase.stderr).toBe(0);
    expect(initialFromBase.stderr).toBe("");
    expect(initialBaseAfter).toEqual(initialBaseBefore);
    const initialSourceBefore = await repositorySnapshot(sourceWorktree);
    const initialFromSource = await runArcNoTty(
      ["decompose", "origin", "--preflight"],
      sourceWorktree,
      { env: hookPath.env },
    );
    const initialSourceAfter = await repositorySnapshot(sourceWorktree);
    expect(initialFromSource.exitCode, initialFromSource.stderr).toBe(0);
    expect(initialFromSource.stdout).toBe(initialFromBase.stdout);
    expect(initialSourceAfter).toEqual(initialSourceBefore);
    const initialStarter = JSON.parse(initialFromBase.stdout) as PublicStarterMap;
    expect(initialFromBase.stdout).toBe(`${canonicalJson(initialStarter)}\n`);
    expect(initialStarter).toMatchObject({
      schemaVersion: 3,
      machine: {
        source: {
          origin: "origin",
          kind: "started-planning",
          logicalBranch: "plan/origin",
          ref: "refs/heads/plan/origin",
          head: sourceHead,
        },
        resultBase: { ref: "refs/heads/main", head: baseHead },
        planningProfile: {
          kind: "paired-spec",
          sourceDesign: ["spec-origin-prd.md", "spec-origin-rfc.md"],
        },
      },
    });

    const initialCutMapPath = join(hookPath.directory, "origin-before-rider.json");
    await writeFile(
      initialCutMapPath,
      `${canonicalJson(completedSymmetricMap(initialStarter))}\n`,
    );
    await writeFile(join(sourceWorktree, "source-rider.txt"), "unrelated source change\n");
    await git(sourceWorktree, ["add", "source-rider.txt"]);
    const riderCommit = await commitAttempt(
      sourceWorktree,
      "chore(test): Add unrelated source rider\n\n"
        + "Context: standalone (maintenance)",
      hookPath.env,
    );
    expect(riderCommit.exitCode, riderCommit.stdout + riderCommit.stderr).toBe(0);
    const beforeRefusal = await repositorySnapshot(repo);
    const refused = await runArcNoTty(
      ["decompose", "origin", "--execute", initialCutMapPath],
      repo,
      { timeout: 60_000, env: hookPath.env },
    );
    expect(refused.exitCode).not.toBe(0);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      recovery: { kind: "none" },
    });
    expect(JSON.parse(refused.stdout)).toMatchObject({
      remedy: {
        invariant: expect.stringContaining("authored map"),
        argv: ["arc", "decompose", "origin", "--preflight"],
      },
    });
    const afterRefusal = await repositorySnapshot(repo);
    expect(afterRefusal).toEqual(beforeRefusal);
    expect(afterRefusal.worktrees).not.toContain("branch refs/heads/chore/decompose-origin");
    expect(await branchExists(repo, "chore/decompose-origin")).toBe(false);
    expect(afterRefusal.claims).toEqual([]);

    await git(sourceWorktree, ["revert", "--no-commit", "HEAD"]);
    const revertCommit = await commitAttempt(
      sourceWorktree,
      "fix(test): Remove unrelated source rider\n\n"
        + "Context: standalone (maintenance)",
      hookPath.env,
    );
    expect(revertCommit.exitCode, revertCommit.stdout + revertCommit.stderr).toBe(0);
    await git(sourceWorktree, ["push"], hookPath.env);
    const finalSourceHead = await git(sourceWorktree, ["rev-parse", "HEAD"]);
    expect(finalSourceHead).not.toBe(sourceHead);
    await expect(git(sourceWorktree, ["cat-file", "-e", "HEAD:source-rider.txt"]))
      .rejects.toThrow();

    const finalBefore = await repositorySnapshot(repo);
    const finalFromBase = await runArcNoTty(
      ["decompose", "origin", "--preflight"],
      repo,
      { env: hookPath.env },
    );
    const finalAfter = await repositorySnapshot(repo);
    expect(finalFromBase.exitCode, finalFromBase.stderr).toBe(0);
    expect(finalFromBase.stderr).toBe("");
    expect(finalAfter).toEqual(finalBefore);
    const finalSourceBefore = await repositorySnapshot(sourceWorktree);
    const finalFromSource = await runArcNoTty(
      ["decompose", "origin", "--preflight"],
      sourceWorktree,
      { env: hookPath.env },
    );
    const finalSourceAfter = await repositorySnapshot(sourceWorktree);
    expect(finalFromSource.exitCode, finalFromSource.stderr).toBe(0);
    expect(finalFromSource.stdout).toBe(finalFromBase.stdout);
    expect(finalSourceAfter).toEqual(finalSourceBefore);
    const finalStarter = JSON.parse(finalFromBase.stdout) as PublicStarterMap;
    expect(finalFromBase.stdout).toBe(`${canonicalJson(finalStarter)}\n`);
    expect(finalStarter.machine.source.head).toBe(finalSourceHead);
    expect(finalStarter.machine.resultBase.head).toBe(baseHead);

    const completed = completedSymmetricMap(finalStarter) as {
      machine: PublicStarterMap["machine"];
      authoring: { destinations: unknown[] };
    };
    expect(completed.machine).toEqual(finalStarter.machine);
    expect(completed.authoring.destinations).toHaveLength(3);
    const cutMapPath = join(hookPath.directory, "origin-cut-map.json");
    await writeFile(cutMapPath, `${canonicalJson(completed)}\n`);
    expect(JSON.parse(await readFile(cutMapPath, "utf8"))).toEqual(completed);

    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000, env: hookPath.env },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    expect(executed.stderr).toBe("");
    const staged = JSON.parse(executed.stdout) as {
      status: "staged";
      operation: {
        occupation: {
          protection: "full";
          path: string;
          candidateBranch: string;
        };
        transitionRecord: {
          schemaVersion: 1;
          origin: string;
          kind: "decompose";
          successors: string[];
          edges: unknown[];
        };
      };
    };
    expect(staged).toMatchObject({
      status: "staged",
      operation: {
        occupation: {
          protection: "full",
          candidateBranch: "chore/decompose-origin",
        },
      },
    });
    expect(staged.operation.transitionRecord).toEqual({
      schemaVersion: 1,
      origin: "origin",
      kind: "decompose",
      successors: ["blocked-leaf", "selected-leaf", "unselected-leaf"],
      edges: [],
    });
    const candidateWorktree = staged.operation.occupation.path;
    worktrees.push(candidateWorktree);
    expect(await pathExists(candidateWorktree)).toBe(true);
    expect(await git(repo, ["rev-parse", "chore/decompose-origin"])).toBe(baseHead);
    expect(await git(candidateWorktree, ["diff", "--cached", "--name-only"]))
      .toContain(".arc/system/.internal/transitions/origin.json");
    expect(executed.stdout).not.toContain("receiptId");
    expect(executed.stdout).not.toContain("finalize-with-continuation");
  }, 240_000);

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
    // Relocation is staged without retirement history; the branch + worktree
    // linger for the post-action reap.
    expect(await pathExists(join(worktree!, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(true);
    expect(await pathExists(join(worktree!, ".arc/active/meta-solo.md"))).toBe(false);
    const staged = await git(worktree!, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(".arc/backlog/planned/solo/meta-solo.md");
    expect(staged).not.toContain("retirement-receipts");
    expect(staged).not.toContain(".arc/system/.internal/transitions/solo.json");
    expect(await pathExists(join(worktree!, ".arc/system/.internal/transitions/solo.json"))).toBe(false);
    expect(await branchExists(repo, "plan/solo")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/`arc teardown solo`/);
  });

  it("arc park --land stages the exact planning result on a partial-protection base", async () => {
    const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode, land.stdout + land.stderr).toBe(0);
    const plannedPath = ".arc/backlog/planned/solo/meta-solo.md";
    const staged = await git(repo, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(plannedPath);
    expect(staged).not.toContain("retirement-receipts");
    expect(await readFile(join(repo, plannedPath))).toEqual(await readFile(join(worktree!, plannedPath)));
    expect(await git(repo, ["rev-parse", `:${plannedPath}`])).toBe(
      await git(worktree, ["rev-parse", `${transition}:${plannedPath}`]),
    );
    expect(land.stdout + land.stderr).not.toContain("Receipt:");
  });

  it("arc park --land preserves nested cohort placement", async () => {
    const cohort = "portfolio/subgroup";
    const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo", cohort);
    worktrees.push(worktree);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode, land.stdout + land.stderr).toBe(0);
    const plannedPath = `.arc/backlog/planned/${cohort}/solo/meta-solo.md`;
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toContain(plannedPath);
    expect(await readFile(join(repo, plannedPath))).toEqual(await readFile(join(worktree, plannedPath)));
  });

  it("full-protection park commit round-trips to a stamped planning husk", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "solo", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    await writeWorktreeOwnershipMarker(worktree!, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "solo" },
      spawningIdentity: "test-user",
    });
    const park = await runArc(["park", "solo", "--reason", "later"], worktree!);
    expect(park.exitCode, park.stdout + park.stderr).toBe(0);
    await commitFixtureBypassingHooks(worktree!, "park solo");
    await git(repo, ["merge", "--no-ff", "plan/solo", "-m", "land parked solo"]);

    const teardown = await runArc(["teardown", "solo", "--force"], worktree!);

    expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(0);
    expect(await branchExists(repo, "plan/solo")).toBe(false);
    expect(await git(worktree!, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");

    const replay = await runArc(["teardown", "solo", "--husk", worktree!], worktree!);
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);

    const plannedMeta = join(repo, ".arc/backlog/planned/solo/meta-solo.md");
    await writeFile(plannedMeta, `${await readFile(plannedMeta, "utf8")}\n`);
    await commitFixtureBypassingHooks(repo, "change parked bytes");

    const changedReplay = await runArc(["teardown", "solo", "--husk", worktree!], worktree!);
    expect(changedReplay.exitCode, changedReplay.stdout + changedReplay.stderr).toBe(1);
    expect(changedReplay.stdout + changedReplay.stderr).toMatch(/retirement evidence mismatch/iu);
    expect(await pathExists(worktree!)).toBe(true);
  });

  it("partial-protection park landing preserves receipt-free teardown authority", async () => {
    const origin = `${repo}-origin.git`;
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", origin]);
    await git(repo, ["remote", "set-url", "origin", origin]);
    await git(repo, ["push", "-u", "origin", "main"]);
    try {
      const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo");
      worktrees.push(worktree);
      await writeWorktreeOwnershipMarker(worktree, {
        createdByArc: true,
        createdFor: { kind: "work-unit", name: "solo" },
        spawningIdentity: "test-user",
      });
      const land = await runArc(["park", "solo", "--land", transition], repo);
      expect(land.exitCode, land.stdout + land.stderr).toBe(0);
      await commitFixtureBypassingHooks(repo, "land parked solo locally");

      const teardown = await runArc(["teardown", "solo", "--force"], worktree);

      expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(0);
      expect(await branchExists(repo, "plan/solo")).toBe(false);
    } finally {
      await removeGitBackedDir(origin);
    }
  });

  it("arc park --land refuses a non-tip transition without writing the base", async () => {
    const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await writeFile(join(worktree, "later.txt"), "later\n");
    await commitFixtureBypassingHooks(worktree, "advance planning tip");

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/not the exact local tip/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  it("arc park --land refuses a planning branch without a registered owner", async () => {
    const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await git(repo, ["worktree", "remove", worktree]);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/not owned by a registered worktree/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  it("arc park --land refuses a broken direct-transition relation", async () => {
    const { worktree } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    await writeFile(join(worktree, "later.txt"), "later\n");
    await commitFixtureBypassingHooks(worktree, "advance beyond the transition");
    const descendant = await git(worktree, ["rev-parse", "HEAD"]);

    const land = await runArc(["park", "solo", "--land", descendant], repo);

    expect(land.exitCode).toBe(1);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  it("arc park --land refuses an outside transition path without writing the base", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "solo", "linked");
    expect(worktree).toBeDefined();
    worktrees.push(worktree!);
    await rm(join(repo, ".arc/active/meta-solo.md"));
    await rm(join(repo, ".arc/active/draft-solo.md"));
    await commitFixtureBypassingHooks(repo, "remove in-flight solo from base");
    const park = await runArc(["park", "solo", "--reason", "pivoting"], worktree!);
    expect(park.exitCode, park.stdout + park.stderr).toBe(0);
    await writeFile(join(worktree!, "outside.txt"), "outside\n");
    await commitFixtureBypassingHooks(worktree!, "park solo with an outside path");
    const transition = await git(worktree!, ["rev-parse", "HEAD"]);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/outside its result/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  it.each([
    ["edited planned bytes", "planned-content"],
    ["an incomplete planned group", "incomplete"],
    ["a surviving source artifact", "source-survivor"],
    ["an invalid ROADMAP transition", "invalid-roadmap"],
  ] as const)("arc park --land refuses %s without writing the base", async (_label, fault) => {
    const { worktree, transition } = await scaffoldCommittedParkTransition(
      repo,
      "solo",
      "[none]",
      { fault },
    );
    worktrees.push(worktree);

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("arc park --land refuses a conflicting base slug without a partial write", async () => {
    const { worktree, transition } = await scaffoldCommittedParkTransition(repo, "solo");
    worktrees.push(worktree);
    const conflictDir = join(repo, ".arc/backlog/provisional/solo");
    await mkdir(conflictDir, { recursive: true });
    await writeFile(join(conflictDir, "meta-solo.md"), startedMeta("solo"));

    const land = await runArc(["park", "solo", "--land", transition], repo);

    expect(land.exitCode).toBe(1);
    expect(land.stdout + land.stderr).toMatch(/conflicting work-unit result/);
    expect(await pathExists(join(repo, ".arc/backlog/planned/solo/meta-solo.md"))).toBe(false);
  });

  // -------------------------------------------------------------------------
  // arc abandon (CLI) — remove artifacts in-verb, defer teardown out-of-band
  // -------------------------------------------------------------------------

  it("fails closed when historical abandon evidence does not bind the retiring branch", async () => {
    const { worktree, branch } = await scaffoldActiveWu(repo, "mono");
    worktrees.push(worktree);
    await writeWorktreeOwnershipMarker(worktree, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "mono" },
      spawningIdentity: "test-user",
    });

    const park = await runArc(["park", "mono", "--reason", "superseded"], repo);
    expect(park.exitCode, park.stdout + park.stderr).toBe(0);
    expect(await pathExists(worktree)).toBe(false);
    expect(await branchExists(repo, branch)).toBe(true);
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/meta-mono.md"))).toBe(true);
    await commitFixtureBypassingHooks(repo, "park active mono");

    const sessionNotes = join(repo, ".arc", "user", "test-user", "mono", "SESSION-NOTES.md");
    await mkdir(dirname(sessionNotes), { recursive: true });
    await writeFile(sessionNotes, "# Session Notes\n");

    const abandon = await runArc(["abandon", "mono", "--yes"], repo);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    expect(await branchExists(repo, branch)).toBe(true);
    expect(await pathExists(join(repo, ".arc/backlog/planned/mono/meta-mono.md"))).toBe(false);
    expect(abandon.stdout + abandon.stderr).toMatch(/`arc teardown mono`/);

    await commitFixtureBypassingHooks(repo, "abandon parked mono");
    const teardown = await runArc(["teardown", "mono"], repo);

    expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(1);
    expect(teardown.stdout + teardown.stderr).toMatch(/retirement evidence is missing/iu);
    expect(await branchExists(repo, branch)).toBe(true);
    expect(await pathExists(sessionNotes)).toBe(true);
  });

  it.each([
    ["abandon", "commit"], ["abandon", "clear"],
    ["park", "commit"], ["park", "clear"],
  ] as const)("%s names staged paths and retries after %s repair", async (verb, repair) => {
    await scaffoldStartedWu(repo, "mono", "in-place");
    const paths = ["staged one.txt", "staged-two.txt"];
    for (const path of paths) await writeFile(join(repo, path), "unrelated change\n");
    await git(repo, ["add", "--", ...paths]);
    const head = await git(repo, ["rev-parse", "HEAD"]);
    const index = await git(repo, ["write-tree"]);
    const metaPath = join(repo, ".arc/active/meta-mono.md");
    const draftPath = join(repo, ".arc/active/draft-mono.md");
    const meta = await readFile(metaPath, "utf8");
    const draft = await readFile(draftPath, "utf8");
    const args = verb === "park" ? ["park", "mono", "--reason", "paused"] : ["abandon", "mono", "--yes"];

    const refused = await runArc(args, repo);
    const output = refused.stdout + refused.stderr;
    expect(refused.exitCode, output).toBe(1);
    for (const path of paths) expect(output).toContain(JSON.stringify(path));
    expect(output).toMatch(/commit.*or clear.*index.*retry/iu);
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(await git(repo, ["write-tree"])).toBe(index);
    expect(await readFile(metaPath, "utf8")).toBe(meta);
    expect(await readFile(draftPath, "utf8")).toBe(draft);
    expect(await pathExists(join(repo, ".arc/system/.internal/transitions/mono.json"))).toBe(false);

    if (repair === "commit") await commitFixtureBypassingHooks(repo, "commit unrelated staged changes");
    else await git(repo, ["restore", "--staged", "--", ...paths]);
    const retried = await runArc(args, repo);
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    expect(await pathExists(metaPath)).toBe(false);
    expect(await pathExists(draftPath)).toBe(false);
    if (verb === "park") expect(await pathExists(join(repo, ".arc/backlog/planned/mono/meta-mono.md"))).toBe(true);
    for (const path of paths) expect(await readFile(join(repo, path), "utf8")).toBe("unrelated change\n");
  });

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
    // Artifacts and lean transition history are staged together on the retiring
    // branch; the branch + worktree linger for the post-action reap.
    expect(await pathExists(join(worktree!, ".arc/active/meta-mono.md"))).toBe(false);
    const staged = await git(worktree!, ["diff", "--cached", "--name-only"]);
    expect(staged).toContain(".arc/active/meta-mono.md");
    expect(staged).toContain(".arc/system/.internal/transitions/mono.json");
    expect(staged).not.toContain("retirement-receipts");
    expect(await branchExists(repo, "plan/mono")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
    expect(result.stdout + result.stderr).toMatch(/`arc teardown mono`/);
  });

  it("arc abandon → commit → ordinary teardown closes its workspace and leaves a stamped linked husk", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    const sessionNotes = join(worktree!, ".arc", "user", "test-user", "mono", "SESSION-NOTES.md");
    await mkdir(dirname(sessionNotes), { recursive: true });
    await writeFile(sessionNotes, "# Session Notes\n");
    await writeWorktreeOwnershipMarker(worktree!, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "mono" },
      spawningIdentity: "test-user",
    });

    const abandon = await runArc(["abandon", "mono", "--yes"], worktree!);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    expect(await pathExists(sessionNotes)).toBe(true);
    // The removal is staged-but-uncommitted (a dirty tree); commit it so the
    // post-action teardown reaps from a clean worktree, per the ceremony.
    await commitFixtureBypassingHooks(worktree!, "abandon mono");

    const teardown = await runArc(["teardown", "mono"], worktree!);

    expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(0);
    expect(await branchExists(repo, "plan/mono")).toBe(false);
    expect(await pathExists(worktree!)).toBe(true);
    expect(await git(worktree!, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(await pathExists(sessionNotes)).toBe(false);

    const replay = await runArc(["teardown", "mono", "--husk", worktree!], worktree!);
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    expect(await pathExists(worktree!)).toBe(true);
  });

  it("arc abandon → commit → teardown --force preserves a retained primary projection", async () => {
    await scaffoldStartedWu(repo, "mono", "in-place");

    const abandon = await runArc(["abandon", "mono", "--yes"], repo);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    await commitFixtureBypassingHooks(repo, "abandon mono");

    const teardown = await runArc(["teardown", "mono", "--force"], repo);

    expect(teardown.exitCode).toBe(0);
    // The base projection still declares the retiring branch, so exact authority
    // leaves both that ref and its registered primary projection intact for retry.
    expect(await pathExists(repo)).toBe(true);
    expect(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("plan/mono");
    expect(await branchExists(repo, "plan/mono")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // arc teardown --force — the four silently-broken behaviors
  // -------------------------------------------------------------------------

  it("refuses primary-side linked cleanup from unrelated historical deletion", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    // Retire the origin (remove its active/ meta) so it is un-shipped, then reap.
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitFixtureBypassingHooks(repo, "retire origin mono");
    await writeWorktreeOwnershipMarker(worktree!, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "mono" },
      spawningIdentity: "test-user",
    });

    const result = await runArc(["teardown", "mono", "--force"], repo);

    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/retirement evidence is missing/iu);
    expect(await branchExists(repo, "plan/mono")).toBe(true);
  });

  it("deletes a remote source ref that is a strict ancestor of the committed transition", async () => {
    await scaffoldStartedWu(repo, "mono", "in-place");
    await git(repo, ["push", "-u", "origin", "plan/mono"]);
    const remoteSourceHead = await git(repo, ["rev-parse", "refs/remotes/origin/plan/mono"]);
    // Primary is checked out on plan/mono; retire the origin there.
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitFixtureBypassingHooks(repo, "retire origin mono");
    await expect(git(repo, ["merge-base", "--is-ancestor", remoteSourceHead, "plan/mono"]))
      .resolves.toBe("");

    const baseWorktree = join(dirname(repo), `${basename(repo)}-mono-base-retirement`);
    await git(repo, ["worktree", "add", baseWorktree, "main"]);
    await rm(join(baseWorktree, ".arc/active/meta-mono.md"));
    await rm(join(baseWorktree, ".arc/active/draft-mono.md"));
    await commitFixtureBypassingHooks(baseWorktree, "retire base projection mono");
    await git(repo, ["worktree", "remove", baseWorktree]);

    const result = await runArc(["teardown", "mono", "--force"], repo);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(await pathExists(repo)).toBe(true);
    expect(await branchExists(repo, "plan/mono")).toBe(false);
    await expect(git(repo, ["ls-remote", "--exit-code", "--heads", "origin", "refs/heads/plan/mono"]))
      .rejects.toThrow();
  });

  it("refuses linked self-teardown from unrelated historical deletion", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    await rm(join(repo, ".arc/active/meta-mono.md"));
    await rm(join(repo, ".arc/active/draft-mono.md"));
    await commitFixtureBypassingHooks(repo, "retire origin mono");
    await writeWorktreeOwnershipMarker(worktree!, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "mono" },
      spawningIdentity: "test-user",
    });

    // Invoke from *inside* the worktree being torn down — the locus-hop must let the
    // process complete despite its cwd disappearing.
    const result = await runArc(["teardown", "mono", "--force"], worktree!);

    expect(result.exitCode, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/retirement evidence is missing/iu);
    expect(await branchExists(repo, "plan/mono")).toBe(true);
    expect(await pathExists(worktree!)).toBe(true);
  });

  it("refuses to tear down a dirty worktree", async () => {
    const { worktree } = await scaffoldStartedWu(repo, "mono", "linked");
    if (worktree !== undefined) worktrees.push(worktree);
    await writeWorktreeOwnershipMarker(worktree!, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: "mono" },
      spawningIdentity: "test-user",
    });
    const abandon = await runArc(["abandon", "mono", "--yes"], worktree!);
    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    await commitFixtureBypassingHooks(worktree!, "abandon mono");
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
