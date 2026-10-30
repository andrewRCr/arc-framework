/** Production resolution of Candidate mutation ownership from the derived locus reader. */

import { readFile, readdir } from "node:fs/promises";

import { openDefaultStore } from "./lifecycle-shared.js";
import { gitExec } from "../lib/io-context.js";
import { readStoreCompletedEvidence } from "../lib/store/lifecycle-completed.js";
import { listLifecycleIndex } from "../lib/store/lifecycle-index.js";
import { readWorkUnit } from "../lib/store/lifecycle-write.js";
import type { OwnerIdentity } from "../lib/store/identity.js";
import type { Store } from "../lib/store/contract.js";
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
  readonly store?: Store;
  readonly projectId?: () => Promise<string>;
  readonly exec: GitExec;
}): Promise<CandidateMutationOwner> {
  const [{ settings }, identity] = await Promise.all([
    readConfigSettings(input.cwd),
    resolveUserIdentity(input.exec),
  ]);
  return projectCandidateMutationOwner(await runDerivedLocusStateProbe({
    cwd: input.cwd,
    store: input.store,
    projectId: input.projectId,
    archiveCadence: settings["archive.cadence"] === "manual" ? "manual" : "with-integration",
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
export async function resolveCompletedCandidateWorkUnits(cwd: string, store: Store = openDefaultStore(cwd, gitExec)): Promise<readonly string[]> {
  if (store.capabilities.stateOffBranch) {
    const evidence = await readStoreCompletedEvidence(store);
    if (evidence.status !== "available") throw new Error("Completed work-unit inventory could not be read completely; repair its diagnostics, then retry.");
    return [...evidence.records.keys()];
  }
  const fs: LifecycleIndexFs = {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    readFile: (path) => readFile(path, "utf8"),
  };
  return [...(await buildLifecycleIndex({ cwd, fs })).values()]
    .filter(({ location }) => location === "completed")
    .map(({ slug }) => slug);
}

/**
 * Resolve the exact generation a Candidate mutation writes natively: the checkout's own live work unit, or from a free
 * primary the completed one, never a live namesake reusing its slug.
 *
 * @param store - The invocation's store; in-repo records are keyed by slug and resolve no owner
 * @param workUnit - The work unit the mutation names
 * @param scope - Whether the entering checkout owns the work unit or continues a completed one
 * @param bound - An owner the invocation already selected for this work unit
 * @returns The owner every read and write of the mutation uses
 */
export async function resolveCandidateMutationGeneration(store: Store, workUnit: string, scope: "owned" | "unowned",
  bound?: OwnerIdentity): Promise<OwnerIdentity | undefined> {
  if (!store.capabilities.stateOffBranch) return undefined;
  if (bound !== undefined && bound.name === workUnit) return bound;
  if (scope === "owned") {
    const live = await readWorkUnit(store, workUnit);
    if (live.status === "refused") throw new Error(`${live.refusal.condition} ${live.refusal.remedy.text}`);
    return live.result.reference.owner;
  }
  const listing = await listLifecycleIndex(store, { locations: ["completed"] });
  if (listing.status === "refused") throw new Error(`${listing.refusal.condition} ${listing.refusal.remedy.text}`);
  if (listing.result.status === "unreadable") throw new Error(`${listing.result.condition} ${listing.result.remedy.text}`);
  const completed = listing.result.status === "absent" ? undefined
    : [...listing.result.index.entries()].find(entry => entry.reference.owner.name === workUnit)?.reference.owner;
  if (completed === undefined) throw new Error(`\`${workUnit}\` is not a completed work unit. Run the command from its checkout.`);
  return completed;
}
