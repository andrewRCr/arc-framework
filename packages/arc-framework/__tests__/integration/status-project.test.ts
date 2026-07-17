import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleStatus, type StatusCliOptions } from "../../src/handlers/status.js";
import { writeErrandRecord } from "../../src/lib/errand/record.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  ROADMAP_PATH,
  renderRoadmapFromIndexResult,
} from "../../src/lib/status/roadmap-regeneration-assert.js";
import { runRoadmapRegenerationAssert } from "../../src/scripts/assert-roadmap-regenerated.js";
import {
  cleanupTempDir,
  createTempRepo,
  makeGitExec,
  makeGitExecInput,
  removeGitBackedDir,
} from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

let repo: string | undefined;
let remote: string | undefined;
type ProcessExitCode = string | number | null | undefined;

function meta(slug: string, state: string, branch: string): string {
  return [
    `# Metadata: ${slug}`,
    "",
    `- **State:** ${state}`,
    "- **Owner:** andrew",
    `- **Branch:** ${branch}`,
    "- **Priority:** P1",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

function metaAt(slug: string, state: string, branch: string, priority: string): string {
  return meta(slug, state, branch).replace("- **Priority:** P1", `- **Priority:** ${priority}`);
}

async function commitAll(cwd: string, message: string): Promise<void> {
  await execFileAsync("git", ["add", "-A"], { cwd });
  await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", message], { cwd });
}

function makeRawGitExec(cwd: string): GitExec {
  return async (cmd, args, options) => {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: options?.cwd ?? cwd,
      signal: options?.signal,
    });
    return { stdout, stderr };
  };
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

async function captureProcessOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  });
  try {
    await fn();
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  return { stdout: stdout.join(""), stderr: stderr.join("") };
}

async function runProject(cwd: string, opts: StatusCliOptions): Promise<string> {
  const originalCwd = process.cwd();
  const savedExitCode: ProcessExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    process.chdir(cwd);
    return await captureStdout(() => handleStatus(undefined, opts));
  } finally {
    process.chdir(originalCwd);
    process.exitCode = savedExitCode;
  }
}

async function runProjectWithDiagnostics(
  cwd: string,
  opts: StatusCliOptions,
): Promise<{ stdout: string; stderr: string }> {
  const originalCwd = process.cwd();
  const savedExitCode: ProcessExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    process.chdir(cwd);
    return await captureProcessOutput(() => handleStatus(undefined, opts));
  } finally {
    process.chdir(originalCwd);
    process.exitCode = savedExitCode;
  }
}

async function runSlug(cwd: string, slug: string, opts: StatusCliOptions): Promise<string> {
  const originalCwd = process.cwd();
  const savedExitCode: ProcessExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    process.chdir(cwd);
    return await captureStdout(() => handleStatus(slug, opts));
  } finally {
    process.chdir(originalCwd);
    process.exitCode = savedExitCode;
  }
}

describe("arc status --project", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (repo !== undefined) await cleanupTempDir(repo);
    if (remote !== undefined) await removeGitBackedDir(remote);
    repo = undefined;
    remote = undefined;
  });

  it("renders live ref-only active metas from a main checkout", async () => {
    repo = await createTempRepo("arc-status-project-");
    remote = `${repo}-origin.git`;
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remote });
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
    await execFileAsync("git", ["config", "arc.identity", "andrew"], { cwd: repo });
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await mkdir(join(repo, ".arc", "backlog", "planned", "ref-only"), { recursive: true });
    await writeFile(
      join(repo, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nbranch.protection: partial\npm.mode: arc-in-git\n",
    );
    await writeFile(
      join(repo, ".arc", "backlog", "planned", "ref-only", "meta-ref-only.md"),
      meta("ref-only", "Planning", "[none]"),
    );
    await commitAll(repo, "scaffold");
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repo });

    await execFileAsync("git", ["checkout", "-b", "plan/ref-only"], { cwd: repo });
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    await writeFile(join(repo, ".arc", "active", "meta-ref-only.md"), meta("ref-only", "Active", "plan/ref-only"));
    await commitAll(repo, "activate ref-only");
    await execFileAsync("git", ["push", "-u", "origin", "plan/ref-only"], { cwd: repo });

    await execFileAsync("git", ["checkout", "-b", "chore/ref-only-errand", "main"], { cwd: repo });
    await execFileAsync("git", ["push", "-u", "origin", "chore/ref-only-errand"], { cwd: repo });
    await writeErrandRecord(
      { exec: makeGitExec(repo), execInput: makeGitExecInput(repo), identity: "andrew" },
      {
        version: 1,
        slug: "ref-only-errand",
        origin: "description",
        intent: "verify project status ignores errand refs",
        branch: "chore/ref-only-errand",
        createdAt: "2026-07-09T00:00:00.000Z",
      },
    );

    await execFileAsync("git", ["checkout", "main"], { cwd: repo });

    const originalCwd = process.cwd();
    const savedExitCode: ProcessExitCode = process.exitCode;
    process.exitCode = undefined;
    const result = await (async (): Promise<{ output: string; exitCode: ProcessExitCode }> => {
      try {
        process.chdir(repo);
        const output = await captureStdout(() => handleStatus(undefined, { project: true }));
        return { output, exitCode: process.exitCode };
      } finally {
        process.chdir(originalCwd);
        process.exitCode = savedExitCode;
      }
    })();

    expect(result.output).toContain("# Roadmap: Project Status");
    expect(result.output).toContain("Source scope: tree + live refs.");
    expect(result.output).toContain("| `Active` | ref-only");
    expect(result.output).toMatch(/\|\s*ref-only\s*\|\s*P1\b/u);
    expect(result.output).not.toContain("ref-only-errand");
    expect(sectionBetween(result.output, "## Ready", "## Blocked")).not.toContain("ref-only");
    expect(result.exitCode).toBeUndefined();
  });

  it.each(["Planning", "Active", "Integrating"] as const)(
    "queries a sibling in %s from another checkout through local remote-tracking refs",
    async (state) => {
      repo = await createTempRepo("arc-status-slug-");
      remote = `${repo}-origin.git`;
      await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remote });
      await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
      await mkdir(join(repo, ".arc", "system"), { recursive: true });
      await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
      await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      await writeFile(
        join(repo, ".arc", "backlog", "planned", "meta-sibling-live.md"),
        meta("sibling-live", "Planning", "[none]"),
      );
      await commitAll(repo, "scaffold sibling");
      await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repo });
      await execFileAsync("git", ["switch", "-c", "feat/sibling-live"], { cwd: repo });
      await mkdir(join(repo, ".arc", "active"), { recursive: true });
      await writeFile(
        join(repo, ".arc", "active", "meta-sibling-live.md"),
        meta("sibling-live", state, "feat/sibling-live"),
      );
      await commitAll(repo, "activate sibling");
      await execFileAsync("git", ["push", "-u", "origin", "feat/sibling-live"], { cwd: repo });
      await execFileAsync("git", ["switch", "main"], { cwd: repo });

      const output = await runSlug(repo, "sibling-live", { json: true });

      expect(JSON.parse(output)).toMatchObject({
        slug: "sibling-live",
        position: { phase: state, location: "active" },
        state: state.toLowerCase(),
        occupied: true,
      });
    },
  );

  it("uses --fetch as a live-membership upgrade while keeping slug queries local by default", async () => {
    repo = await createTempRepo("arc-status-slug-fetch-");
    remote = `${repo}-origin.git`;
    const slug = "stale-local-ref";
    const branch = `feat/${slug}`;
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remote });
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
    await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    await writeFile(join(repo, ".arc", "backlog", "planned", `meta-${slug}.md`), meta(slug, "Planning", "[none]"));
    await commitAll(repo, "scaffold stale-ref query");
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repo });
    await execFileAsync("git", ["switch", "-c", branch], { cwd: repo });
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    await writeFile(join(repo, ".arc", "active", `meta-${slug}.md`), meta(slug, "Active", branch));
    await commitAll(repo, "activate stale-ref query");
    const { stdout: branchTip } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repo });
    await execFileAsync("git", ["push", "-u", "origin", branch], { cwd: repo });
    await execFileAsync("git", ["switch", "main"], { cwd: repo });
    await execFileAsync("git", ["branch", "-D", branch], { cwd: repo });
    await execFileAsync("git", ["push", "origin", "--delete", branch], { cwd: repo });
    await execFileAsync("git", ["update-ref", `refs/remotes/origin/${branch}`, branchTip.trim()], { cwd: repo });

    const local = JSON.parse(await runSlug(repo, slug, { json: true }));
    const live = JSON.parse(await runSlug(repo, slug, { json: true, fetch: true }));

    expect(local).toMatchObject({ state: "active", occupied: true });
    expect(live).toMatchObject({ state: "planned", occupied: false });
    expect(live).not.toHaveProperty("warnings");
  });

  it("warns and degrades instead of blocking when a live slug query cannot reach origin", async () => {
    repo = await createTempRepo("arc-status-slug-unreachable-");
    const slug = "offline-query";
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await mkdir(join(repo, ".arc", "backlog", "planned"), { recursive: true });
    await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    await writeFile(join(repo, ".arc", "backlog", "planned", `meta-${slug}.md`), meta(slug, "Planning", "[none]"));
    await commitAll(repo, "scaffold offline query");

    const output = JSON.parse(await runSlug(repo, slug, { json: true, fetch: true }));
    const human = await runSlug(repo, slug, { fetch: true });

    expect(output).toMatchObject({ state: "planned", occupied: false });
    expect(output.warnings).toContain("Remote unreachable; query derived from local refs only.");
    expect(human).toContain("warning: Remote unreachable; query derived from local refs only.");
  });

  it("adds a sibling worktree path to query output without changing occupancy", async () => {
    repo = await createTempRepo("arc-status-slug-worktree-");
    remote = `${repo}-sibling`;
    const slug = "checked-out-sibling";
    const branch = `feat/${slug}`;
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
    await commitAll(repo, "scaffold sibling worktree");
    await execFileAsync("git", ["worktree", "add", "-b", branch, remote, "main"], { cwd: repo });
    await mkdir(join(remote, ".arc", "active"), { recursive: true });
    await writeFile(join(remote, ".arc", "active", `meta-${slug}.md`), meta(slug, "Active", branch));
    await commitAll(remote, "activate sibling worktree");

    const output = JSON.parse(await runSlug(repo, slug, { json: true }));

    expect(output).toMatchObject({ state: "active", occupied: true, worktreePath: remote });
  });

  it("renders --staged tree inputs from the git index, not the working tree", async () => {
    repo = await createTempRepo("arc-status-staged-");
    await execFileAsync("git", ["config", "arc.identity", "andrew"], { cwd: repo });
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    await writeFile(
      join(repo, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nbranch.protection: partial\npm.mode: arc-in-git\n",
    );
    // HEAD: foo Active at P1.
    await writeFile(join(repo, ".arc", "active", "meta-foo.md"), meta("foo", "Active", "[none]"));
    await commitAll(repo, "scaffold foo");

    // Stage foo at P2, then dirty the working file to P3 (unstaged) so the index,
    // the working tree, and HEAD all disagree.
    await writeFile(join(repo, ".arc", "active", "meta-foo.md"), metaAt("foo", "Active", "[none]", "P2"));
    await execFileAsync("git", ["add", "-A"], { cwd: repo });
    await writeFile(join(repo, ".arc", "active", "meta-foo.md"), metaAt("foo", "Active", "[none]", "P3"));

    const staged = await runProject(repo, { project: true, staged: true });
    const worktree = await runProject(repo, { project: true, local: true });

    // --staged reads the index (P2); the working-tree render reads disk (P3).
    expect(staged).toContain("Source scope: tree + local refs.");
    expect(staged).toMatch(/\|\s*foo\s*\|\s*P2\b/u);
    expect(staged).not.toMatch(/\|\s*foo\s*\|\s*P3\b/u);
    expect(worktree).toMatch(/\|\s*foo\s*\|\s*P3\b/u);
  });

  it.each([
    ["staged", { project: true, staged: true }],
    ["live", { project: true, local: true }],
  ] satisfies [string, StatusCliOptions][])(
    "writes %s project-readiness warnings to stderr without contaminating stdout",
    async (_mode, options) => {
      repo = await createTempRepo("arc-status-warning-channel-");
      await mkdir(join(repo, ".arc", "system"), { recursive: true });
      await mkdir(join(repo, ".arc", "backlog", "planned", "warning-source"), { recursive: true });
      await writeFile(join(repo, ".arc", "system", "arc-config.yml"), "branch.base: main\n");
      await writeFile(
        join(repo, ".arc", "backlog", "planned", "warning-source", "meta-warning-source.md"),
        meta("warning-source", "Planning", "[none]")
          .replace("- **Depends On:** [none]", "- **Depends On:** missing-dependency"),
      );
      await commitAll(repo, "scaffold warning source");

      const output = await runProjectWithDiagnostics(repo, options);

      expect(output.stdout).not.toContain("## Warnings");
      expect(output.stdout).not.toContain("depends on missing work unit");
      expect(output.stderr).toContain("warning: `warning-source` depends on missing work unit `missing-dependency`");
    },
  );

  it("drops an archiving own-branch row while preserving sibling rows and hook/CLI byte parity", async () => {
    repo = await createTempRepo("arc-status-archive-window-");
    remote = `${repo}-origin.git`;
    const slug = "archiving-own-row";
    const branch = `feat/${slug}`;
    const siblingSlug = "active-sibling-row";
    const siblingBranch = `feat/${siblingSlug}`;
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await execFileAsync("git", ["config", "gc.auto", "0"], { cwd: remote });
    await execFileAsync("git", ["remote", "add", "origin", remote], { cwd: repo });
    await execFileAsync("git", ["config", "arc.identity", "andrew"], { cwd: repo });
    await mkdir(join(repo, ".arc", "system"), { recursive: true });
    await mkdir(join(repo, ".arc", "backlog"), { recursive: true });
    await writeFile(
      join(repo, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nbranch.protection: partial\npm.mode: arc-in-git\n",
    );
    await commitAll(repo, "scaffold archival render");
    await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd: repo });

    await execFileAsync("git", ["switch", "-c", siblingBranch], { cwd: repo });
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    await writeFile(
      join(repo, ".arc", "active", `meta-${siblingSlug}.md`),
      meta(siblingSlug, "Active", siblingBranch),
    );
    await commitAll(repo, "activate sibling row");
    await execFileAsync("git", ["push", "-u", "origin", siblingBranch], { cwd: repo });

    await execFileAsync("git", ["switch", "main"], { cwd: repo });
    await execFileAsync("git", ["switch", "-c", branch], { cwd: repo });
    await mkdir(join(repo, ".arc", "active"), { recursive: true });
    const activePath = join(repo, ".arc", "active", `meta-${slug}.md`);
    await writeFile(activePath, meta(slug, "Integrating", branch));
    await commitAll(repo, "integrate own row");
    await execFileAsync("git", ["push", "-u", "origin", branch], { cwd: repo });

    const completedDir = join(repo, ".arc", "completed", "2026-q3");
    const completedPath = join(completedDir, `meta-${slug}.md`);
    await mkdir(completedDir, { recursive: true });
    await execFileAsync("git", ["mv", activePath, completedPath], { cwd: repo });
    await writeFile(completedPath, meta(slug, "Shipped", branch));
    await execFileAsync("git", ["add", "-A"], { cwd: repo });

    const exec = makeRawGitExec(repo);
    const rendered = await renderRoadmapFromIndexResult({ cwd: repo, exec, baseBranch: "main" });
    expect(rendered.content).not.toContain(`| \`Integrating\` | ${slug}`);
    expect(rendered.content).toContain(`| \`Active\` | ${siblingSlug}`);

    await writeFile(join(repo, ROADMAP_PATH), rendered.content);
    await execFileAsync("git", ["add", ROADMAP_PATH], { cwd: repo });
    const hook = await runRoadmapRegenerationAssert({
      cwd: repo,
      exec,
      baseBranch: "main",
      stagedPaths: [ROADMAP_PATH],
    });
    const cli = await runProject(repo, { project: true, staged: true });

    expect(hook).toEqual({ exitCode: 0, stdout: "", stderr: "" });
    expect(cli).toBe(rendered.content);
  });
});

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) return "";
  return markdown.slice(startIndex, endIndex);
}
