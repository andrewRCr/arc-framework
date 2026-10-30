/** Production resolution of Candidate mutation ownership from the derived locus reader. */

import { readFile, readdir } from "node:fs/promises";

import { openDefaultStore } from "./lifecycle-shared.js";
import { gitExec } from "../lib/io-context.js";
import { listLifecycleIndex } from "../lib/store/lifecycle-index.js";
import { readWorkUnit } from "../lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences, sameOwner, type OwnerIdentity } from "../lib/store/identity.js";
import { StoreRefusalError } from "../lib/store/refusal-error.js";
import { ReviewOwnerSelectionError } from "../lib/store/kinds/review/errors.js";
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
  if (store.capabilities.stateOffBranch) return (await readCompletedOwners(store)).map(owner => owner.name);
  return readCompletedSlugs(cwd);
}

/**
 * Resolve the exact work items whose archived lifecycle records authorize ownerless Candidate continuation. In-repo
 * records are keyed by slug; natively each completed generation is its own owner, and an incomplete inventory refuses.
 *
 * @param cwd - Repository root containing the lifecycle records
 * @returns Completed work-item owners
 */
export async function resolveCompletedCandidateOwners(cwd: string, store: Store = openDefaultStore(cwd, gitExec)):
  Promise<readonly OwnerIdentity[]> {
  if (store.capabilities.stateOffBranch) return readCompletedOwners(store);
  // A completed name that is not a slug is one no command can name, so it selects no owner.
  return (await readCompletedSlugs(cwd)).flatMap(name => {
    const owner = OwnerIdentitySchema.safeParse({ type: "work-item", name });
    return owner.success ? [owner.data] : [];
  });
}

async function readCompletedSlugs(cwd: string): Promise<string[]> {
  const fs: LifecycleIndexFs = {
    readdir: (path) => readdir(path, { withFileTypes: true }),
    readFile: (path) => readFile(path, "utf8"),
  };
  return [...(await buildLifecycleIndex({ cwd, fs })).values()]
    .filter(({ location }) => location === "completed")
    .map(({ slug }) => slug);
}

async function readCompletedOwners(store: Store): Promise<readonly OwnerIdentity[]> {
  const listing = await listLifecycleIndex(store, { locations: ["completed"] });
  if (listing.status === "refused") throw new StoreRefusalError(listing.refusal, true);
  const result = listing.result;
  if (result.status === "unreadable") throw new ReviewOwnerSelectionError("corrupt-state", result.condition, result.remedy);
  if (result.status === "absent") return [];
  if (result.missed || result.diagnostics.length > 0) {
    throw new ReviewOwnerSelectionError("corrupt-state", ["The completed work-unit inventory is incomplete.",
      ...result.diagnostics.map(item => `${item.condition} ${item.remedy.text}`)].join(" "),
    { text: "Repair the completed work units' metadata, then retry." });
  }
  return result.index.entries().map(entry => entry.reference.owner);
}

/**
 * Resolve the exact generation a Candidate mutation writes natively: the checkout's own live work unit, or from a free
 * primary the one completed generation of its slug, never a live namesake reusing it.
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
  if (scope === "owned") {
    if (bound !== undefined && bound.name === workUnit) return bound;
    const live = await readWorkUnit(store, workUnit);
    if (live.status === "refused") throw new StoreRefusalError(live.refusal, true);
    return live.result.reference.owner;
  }
  const completed = (await readCompletedOwners(store)).filter(owner => owner.name === workUnit);
  if (bound !== undefined) {
    if (completed.some(owner => sameOwner(owner, bound))) return bound;
    throw new ReviewOwnerSelectionError("invalid-input", `The selected \`${workUnit}\` work item is not a completed generation.`,
      { text: `Run the command from \`${workUnit}\`'s checkout.` });
  }
  if (completed.length > 1) {
    throw new StoreRefusalError({ code: "ambiguous-match", class: "recoverable",
      candidates: completed.map(owner => recordReferences["work-item/meta"](owner)),
      condition: `\`${workUnit}\` names more than one completed work unit.`,
      remedy: { text: "Rename one of them to a free slug, then retry." } }, true);
  }
  const [owner] = completed;
  if (owner === undefined) {
    throw new ReviewOwnerSelectionError("invalid-input", `\`${workUnit}\` is not a completed work unit.`,
      { text: "Run the command from its checkout." });
  }
  return owner;
}
