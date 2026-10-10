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
import { basename } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import type { GitExec } from "../lib/git/exec.js";
import { environmentForGitCwd, MAX_GIT_OUTPUT_BYTES } from "../lib/git/process-executor.js";
import { declareInteractionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import {
  applyRoadmapConflictAutoRemedy,
  formatRoadmapConflictAutoRemedyMessage,
} from "../lib/status/roadmap-conflict-auto-remedy.js";

const execFileAsync = promisify(execFile);

/** Closed-stdin subprocess policy owned by the ROADMAP remedy hook adapter. */
export const remedyRoadmapConflictInputPolicyDeclarations = [{
  commandPath: "hook-remedy-roadmap-conflict", aliases: [], sites: [declareInteractionSite(
    { file: "scripts/remedy-roadmap-conflict.ts", kind: "subprocess", callee: "execFileAsync", occurrence: 1 },
    {
      acquisition: "subprocess", schemaOwnership: "none", cancellation: "not-applicable",
      automation: { noInput: "same", flags: [], acceptedSyntax: [] },
      mutationBoundary: "hook-remedy-roadmap-conflict subprocess boundary", subprocess: "close-stdin",
    },
  )],
}] satisfies readonly CommandInputDeclaration[];

/** Real Git executor for this script; stdout is not trimEnd()ed. */
const rawGitExec: GitExec = async (cmd, args, options) => {
  const environment = environmentForGitCwd(options?.cwd);
  const env = options?.indexFile === undefined
    ? environment
    : { ...(environment ?? process.env), GIT_INDEX_FILE: options.indexFile };
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: options?.cwd,
    env,
    signal: options?.signal,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
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
  const exec: GitExec = async (command, args, options) => await rawGitExec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  });
  const result = await applyRoadmapConflictAutoRemedy({
    cwd,
    exec,
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

/** Run the packaged hidden hook command and forward its process result. */
export async function runRoadmapConflictAutoRemedyCommand(): Promise<void> {
  try {
    const result = await runRoadmapConflictAutoRemedy(process.cwd());
    if (result.stdout !== "") process.stdout.write(result.stdout);
    if (result.stderr !== "") process.stderr.write(result.stderr);
    if (result.exitCode !== 0) process.exitCode = result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`ROADMAP conflict auto-remedy failed: ${message}\n`);
    process.exitCode = 1;
  }
}

const modulePath = fileURLToPath(import.meta.url);
// Preserve the source-script fallback without treating the importing bundle (`dist/cli.js`) as
// this module's entrypoint. Bundlers rewrite import.meta.url for every bundled source module.
if (basename(modulePath).startsWith("remedy-roadmap-conflict.") && modulePath === process.argv[1]) {
  void runRoadmapConflictAutoRemedyCommand();
}
