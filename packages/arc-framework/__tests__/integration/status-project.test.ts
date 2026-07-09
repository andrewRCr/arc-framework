import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { handleStatus } from "../../src/handlers/status.js";
import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";

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
    expect(result.output).toContain("| ref-only  | P1");
    expect(sectionBetween(result.output, "## Ready", "## Blocked")).not.toContain("ref-only");
    expect(result.exitCode).toBeUndefined();
  });
});

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  const endIndex = markdown.indexOf(end, startIndex + start.length);
  if (startIndex === -1 || endIndex === -1) return "";
  return markdown.slice(startIndex, endIndex);
}
