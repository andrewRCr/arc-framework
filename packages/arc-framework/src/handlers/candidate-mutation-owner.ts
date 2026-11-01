/** Production resolution of Candidate mutation ownership from the derived locus reader. */

import { readFile, readdir } from "node:fs/promises";

import { openDefaultStore } from "./lifecycle-shared.js";
import { gitExec } from "../lib/io-context.js";
import { listLifecycleIndex } from "../lib/store/lifecycle-index.js";
import { liveNames } from "../lib/store/lifecycle-completed.js";
import { readWorkUnit } from "../lib/store/lifecycle-write.js";
import { OwnerIdentitySchema, sameOwner, type OwnerIdentity } from "../lib/store/identity.js";
import { StoreRefusalError } from "../lib/store/refusal-error.js";
import { ReviewOwnerSelectionError } from "../lib/store/kinds/review/errors.js";
import { readCandidateRecord } from "../lib/store/kinds/review/candidate/access.js";
import { readReviewWorkUnitByRef } from "../lib/store/review-work-unit.js";
import type { Store } from "../lib/store/contract.js";
import type { StoreRecord } from "../lib/store/read.js";
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
 * Resolve the work units whose archived lifecycle records authorize ownerless Candidate continuation. Natively a
 * completed name a live work unit holds is withheld, since a name alone cannot tell the two generations apart.
 *
 * @param cwd - Repository root containing the lifecycle records
 * @returns Completed work-unit slugs
 */
export async function resolveCompletedCandidateWorkUnits(cwd: string, store: Store = openDefaultStore(cwd, gitExec)): Promise<readonly string[]> {
  if (store.capabilities.stateOffBranch) {
    const [owners, held] = await Promise.all([readCompletedOwners(store), readLiveNames(store)]);
    return owners.map(owner => owner.name).filter(name => !held.has(name));
  }
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

/** A name a live work unit holds authorizes no completed continuation by name; an unreadable live inventory refuses. */
async function readLiveNames(store: Store): Promise<ReadonlySet<string>> {
  const listing = await listLifecycleIndex(store, { locations: ["active", "planned", "provisional"] });
  if (listing.status === "refused") throw new StoreRefusalError(listing.refusal, true);
  const result = listing.result;
  if (result.status === "unreadable") throw new ReviewOwnerSelectionError("corrupt-state", result.condition, result.remedy);
  return result.status === "complete" ? liveNames(result) : new Set();
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
 * primary the completed generation of its slug holding the mutated Candidate, never a live namesake reusing it.
 *
 * @param store - The invocation's store; in-repo records are keyed by slug and resolve no owner
 * @param workUnit - The work unit the mutation names
 * @param scope - Whether the entering checkout owns the work unit or continues a completed one
 * @param candidate - The repository root and the Candidate the mutation names
 * @param bound - An owner the invocation already selected for this work unit
 * @param checkout - The owning checkout's marker-bound UID, and a completed generation's branch, each of which selects
 *   that generation rather than a live namesake
 * @returns The owner every read and write of the mutation uses
 */
export async function resolveCandidateMutationGeneration(store: Store, workUnit: string, scope: "owned" | "unowned",
  candidate: { cwd: string; candidateId: string }, bound?: OwnerIdentity,
  checkout?: OwnedCheckout): Promise<OwnerIdentity | undefined> {
  if (!store.capabilities.stateOffBranch) return undefined;
  return scope === "owned" ? resolveOwnedGeneration(store, workUnit, bound, checkout)
    : resolveCompletedGeneration(store, workUnit, candidate, bound);
}

/** What an owning checkout carries to select its own generation of a slug a live namesake may share. */
export type OwnedCandidateCheckout = Pick<Extract<CandidateMutationOwner, { status: "owned" }>, "completed" | "branch" | "uid">;
interface OwnedCheckout extends OwnedCandidateCheckout { projectId?: () => Promise<string> }

/**
 * Resolve the exact generation an owning checkout's native Candidate and review records belong to, by the same
 * precedence a Candidate mutation uses, independent of any owner the invocation bound.
 *
 * @param store - The invocation's store; in-repo records are keyed by slug and resolve no owner
 * @param owner - The checkout's owned Candidate mutation owner
 * @param projectId - The project identity the branch lookup binds
 * @returns The checkout's own generation
 */
export async function resolveOwnedCandidateGeneration(store: Store,
  owner: Extract<CandidateMutationOwner, { status: "owned" }>, projectId?: () => Promise<string>):
  Promise<OwnerIdentity | undefined> {
  if (!store.capabilities.stateOffBranch) return undefined;
  return resolveOwnedGeneration(store, owner.workUnit, undefined, { ...ownedCheckout(owner), projectId });
}

/** The selectors an owned checkout carries, without its slug or status. */
export function ownedCheckout(owner: Extract<CandidateMutationOwner, { status: "owned" }>): OwnedCandidateCheckout {
  return { ...(owner.completed === undefined ? {} : { completed: owner.completed }),
    ...(owner.branch === undefined ? {} : { branch: owner.branch }), ...(owner.uid === undefined ? {} : { uid: owner.uid }) };
}

// The entering checkout's own generation: a bound owner, the one its marker's UID names, the completed generation its
// branch links, or else the slug's. A completed checkout whose slug now selects a live namesake refuses rather than
// bind that namesake.
async function resolveOwnedGeneration(store: Store, workUnit: string, bound?: OwnerIdentity,
  checkout?: OwnedCheckout): Promise<OwnerIdentity> {
  if (bound !== undefined && bound.name === workUnit) return bound;
  if (checkout?.uid !== undefined) {
    return (await readOwnedRecord(store, workUnit,
      OwnerIdentitySchema.parse({ type: "work-item", name: workUnit, uid: checkout.uid }))).reference.owner;
  }
  if (checkout?.branch !== undefined) {
    const linked = await readReviewWorkUnitByRef({ store, projectId: checkout.projectId }, checkout.branch);
    if (linked?.name === workUnit) return linked.record.reference.owner;
  }
  const record = await readOwnedRecord(store, workUnit);
  if (checkout?.completed === true && record.placement?.kind !== "completed") {
    throw new ReviewOwnerSelectionError("invalid-input",
      `\`${workUnit}\` names a live work unit, and neither this checkout's marker nor its branch selects its completed one.`,
      { text: `Check out the branch the completed \`${workUnit}\` work unit links, then retry.` });
  }
  return record.reference.owner;
}

async function readOwnedRecord(store: Store, workUnit: string, owner?: OwnerIdentity): Promise<StoreRecord> {
  const read = await readWorkUnit(store, workUnit, owner);
  if (read.status === "refused") throw new StoreRefusalError(read.refusal, true);
  return read.result;
}

// From a free primary, the completed generation of the slug that holds the mutated Candidate.
async function resolveCompletedGeneration(store: Store, workUnit: string, candidate: { cwd: string; candidateId: string },
  bound?: OwnerIdentity): Promise<OwnerIdentity> {
  const completed = (await readCompletedOwners(store)).filter(owner => owner.name === workUnit);
  if (bound !== undefined) {
    if (completed.some(owner => sameOwner(owner, bound))) return bound;
    throw new ReviewOwnerSelectionError("invalid-input", `The selected \`${workUnit}\` work item is not a completed generation.`,
      { text: `Run the command from \`${workUnit}\`'s checkout.` });
  }
  const [owner] = completed.length > 1 ? await holdingCandidate(store, workUnit, completed, candidate) : completed;
  if (owner === undefined) {
    throw new ReviewOwnerSelectionError("invalid-input", `\`${workUnit}\` is not a completed work unit.`,
      { text: "Run the command from its checkout." });
  }
  return owner;
}

// Several completed generations share the slug: the one whose stored Candidate the mutation names is the one it writes.
async function holdingCandidate(store: Store, workUnit: string, completed: readonly OwnerIdentity[],
  candidate: { cwd: string; candidateId: string }): Promise<readonly OwnerIdentity[]> {
  const holders: OwnerIdentity[] = [];
  for (const owner of completed) {
    const record = await readCandidateRecord(candidate.cwd, workUnit, { store, owner });
    if (record?.attestation.candidateId === candidate.candidateId) holders.push(owner);
  }
  if (holders.length === 1) return holders;
  throw new ReviewOwnerSelectionError(holders.length === 0 ? "invalid-input" : "corrupt-state", holders.length === 0
    ? `No completed \`${workUnit}\` work unit holds Candidate \`${candidate.candidateId}\`.`
    : `More than one completed \`${workUnit}\` work unit holds Candidate \`${candidate.candidateId}\`.`,
  { text: holders.length === 0 ? "Name the Candidate the work unit holds, then retry."
    : `Inspect the completed \`${workUnit}\` work units' Candidate records, then retry.` });
}
