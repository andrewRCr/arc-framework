/** Production resolution of Candidate mutation ownership from the derived locus reader. */

import { readFile, readdir } from "node:fs/promises";

import type { GitExec } from "../lib/git/exec.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../lib/work-unit/lifecycle-index.js";
import {
  projectCandidateMutationOwner,
  type CandidateMutationOwner,
} from "../lib/work-unit/candidate-mutation-owner.js";
import { runDerivedLocusStateProbe } from "./derived-locus-state-probe.js";
import { resolveUserIdentity } from "./shared.js";

/**
 * Resolve the entering checkout's Candidate mutation owner from fresh locus evidence.
 *
 * @param input - Repository root and Git execution boundary
 * @returns One exact work-unit owner, a free-primary continuation, or refusal
 */
export async function resolveCandidateMutationOwner(input: {
  readonly cwd: string;
  readonly exec: GitExec;
}): Promise<CandidateMutationOwner> {
  const [{ settings }, identity] = await Promise.all([
    readConfigSettings(input.cwd),
    resolveUserIdentity(input.exec),
  ]);
  return projectCandidateMutationOwner(await runDerivedLocusStateProbe({
    cwd: input.cwd,
    identity,
    baseBranch: settings["branch.base"],
    exec: input.exec,
  }));
}

/**
 * Resolve the work units whose archived lifecycle records authorize ownerless Candidate continuation.
 *
 * @param cwd - Repository root containing the lifecycle records
 * @returns Completed work-unit slugs
 */
export async function resolveCompletedCandidateWorkUnits(cwd: string): Promise<readonly string[]> {
  const fs: LifecycleIndexFs = {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    readFile: (path) => readFile(path, "utf8"),
  };
  return [...(await buildLifecycleIndex({ cwd, fs })).values()]
    .filter(({ location }) => location === "completed")
    .map(({ slug }) => slug);
}
