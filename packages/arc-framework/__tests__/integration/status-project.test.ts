import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleStatus, type StatusCliOptions } from "../../src/handlers/status.js";
import { writeErrandRecord } from "../../src/lib/errand/record.js";
import {
  cleanupTempDir,
  createTempRepo,
  makeGitExec,
  makeGitExecInput,
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

describe("arc status --project", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (repo !== undefined) await cleanupTempDir(repo);
    if (remote !== undefined) await rm(remote, { recursive: true, force: true });
    repo = undefined;
    remote = undefined;
  });

  it("renders live ref-only active metas from a main checkout", async () => {
    repo = await createTempRepo("arc-status-project-");
    remote = `${repo}-origin.git`;
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
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
});

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) return "";
  return markdown.slice(startIndex, endIndex);
}
