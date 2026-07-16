/**
 * Pre-commit entry point: auto-remedy ROADMAP-only merge conflicts.
 *
 * When the only conflicted (or marker-bearing) path is the derived ROADMAP,
 * regenerate from the staged-index projection, restage, and allow the commit
 * to proceed. Wider conflicts are left for the normal hard-error checks.
 *
 * @module
 */

import { writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { GitExec } from "../lib/git/exec.js";
import {
  applyRoadmapConflictAutoRemedy,
  formatRoadmapConflictAutoRemedyMessage,
} from "../lib/status/roadmap-conflict-auto-remedy.js";

const execFileAsync = promisify(execFile);

/** Real Git executor for this script; stdout is not trimEnd()ed. */
const rawGitExec: GitExec = async (cmd, args, options) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: options?.cwd,
    signal: options?.signal,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 30_000,
  });
  return { stdout, stderr };
};

/**
 * Run the ROADMAP-only conflict auto-remedy against the current repository.
 *
 * @returns Process exit code: 0 on skip/apply, 1 on failure.
 */
export async function runRoadmapConflictAutoRemedy(
  cwd: string = process.cwd(),
): Promise<{ exitCode: 0 | 1; stdout: string; stderr: string }> {
  const result = await applyRoadmapConflictAutoRemedy({
    cwd,
    exec: rawGitExec,
    writeFile: async (path, content) => {
      await writeFile(path, content, "utf8");
    },
  });

  const message = formatRoadmapConflictAutoRemedyMessage(result);
  if (result.status === "failed") {
    return { exitCode: 1, stdout: "", stderr: `${message}\n` };
  }
  return {
    exitCode: 0,
    stdout: message === "" ? "" : `${message}\n`,
    stderr: "",
  };
}

async function main(): Promise<void> {
  const result = await runRoadmapConflictAutoRemedy(process.cwd());
  if (result.stdout !== "") process.stdout.write(result.stdout);
  if (result.stderr !== "") process.stderr.write(result.stderr);
  process.exit(result.exitCode);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
