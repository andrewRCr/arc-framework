/**
 * ROADMAP regeneration pre-commit entry point.
 *
 * Runs only when the tracked project readiness view is staged. A mismatch
 * blocks when the fresh staged-index render is determinate; the same mismatch
 * becomes a warning when the local-ref snapshot moved during derivation.
 *
 * @module
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { readConfigSettings } from "../lib/config/status-reader.js";
import type { GitExec } from "../lib/git/exec.js";
import {
  ROADMAP_PATH,
  ROADMAP_RERENDER_INSTRUCTION,
  assertRoadmapRegenerated,
  renderRoadmapFromIndexResult,
  type RenderRoadmapFromIndexOptions,
} from "../lib/status/roadmap-regeneration-assert.js";

/** Script result mapped by the shell hook into error/warning/pass behavior. */
export interface RoadmapRegenerationScriptResult {
  /** Process exit code: nonzero blocks, zero allows. */
  exitCode: 0 | 1;
  /** Warning output; non-empty with exit 0 means warn-and-allow. */
  stdout: string;
  /** Error output; non-empty with exit 1 means reject. */
  stderr: string;
}

/** Options for {@link runRoadmapRegenerationAssert}. */
export interface RunRoadmapRegenerationAssertOptions {
  /** Repository root containing the staged index. */
  cwd: string;
  /** Git executor that preserves stdout bytes for blob reads. */
  exec: GitExec;
  /** Optional pre-resolved staged path list for tests or hook-side filtering. */
  stagedPaths?: readonly string[];
  /** Optional fixed base branch; omitted reads arc-config.yml. */
  baseBranch?: string;
  /** Optional fixed render stamp for tests. */
  renderedRef?: RenderRoadmapFromIndexOptions["renderedRef"];
}

const execFileAsync = promisify(execFile);

/**
 * Run the ROADMAP regeneration assert over the staged index.
 *
 * @param options - Repository root, Git executor, and optional test seams.
 * @returns The shell-facing exit code plus stdout/stderr content.
 */
export async function runRoadmapRegenerationAssert(
  options: RunRoadmapRegenerationAssertOptions,
): Promise<RoadmapRegenerationScriptResult> {
  const stagedPaths = options.stagedPaths ?? await stagedRoadmapPaths(options.exec, options.cwd);
  if (!stagedPaths.includes(ROADMAP_PATH)) return pass();

  const [stagedContent, rendered] = await Promise.all([
    readStagedRoadmap(options.exec, options.cwd),
    renderRoadmapFromIndexResult({
      cwd: options.cwd,
      exec: options.exec,
      baseBranch: options.baseBranch ?? await readBaseBranch(options.cwd),
      ...(options.renderedRef !== undefined ? { renderedRef: options.renderedRef } : {}),
    }),
  ]);

  const verdict = assertRoadmapRegenerated({
    stagedContent,
    renderedContent: rendered.content,
    indeterminate: rendered.indeterminate,
  });

  switch (verdict.status) {
    case "pass":
      return pass();
    case "warn-and-allow":
      return { exitCode: 0, stdout: `${verdict.message}\n`, stderr: "" };
    case "reject-markers":
    case "reject-mismatch":
      return { exitCode: 1, stdout: "", stderr: `${verdict.message}\n` };
  }
}

async function stagedRoadmapPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec("git", [
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=ACMR",
    "--",
    ROADMAP_PATH,
  ], { cwd });
  return stdout.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "");
}

async function readStagedRoadmap(exec: GitExec, cwd: string): Promise<string> {
  const { stdout } = await exec("git", ["show", `:${ROADMAP_PATH}`], { cwd });
  return stdout;
}

async function readBaseBranch(cwd: string): Promise<string> {
  return (await readConfigSettings(cwd)).settings["branch.base"];
}

function pass(): RoadmapRegenerationScriptResult {
  return { exitCode: 0, stdout: "", stderr: "" };
}

/** Real Git executor for this script; unlike shared CLI Git, stdout is not trimEnd()ed. */
const rawGitExec: GitExec = async (cmd, args, options) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: options?.cwd,
    signal: options?.signal,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15_000,
  });
  return { stdout, stderr };
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function main(): Promise<void> {
  try {
    const result = await runRoadmapRegenerationAssert({ cwd: process.cwd(), exec: rawGitExec });
    if (result.stdout !== "") process.stdout.write(result.stdout);
    if (result.stderr !== "") process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  } catch (err) {
    process.stderr.write(`Unable to verify ${ROADMAP_PATH}: ${errorMessage(err)}\n`);
    process.stderr.write(`${ROADMAP_RERENDER_INSTRUCTION}\n`);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
