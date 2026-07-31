/** Repository-bound append-only advancement of one committed decomposition candidate. */

import {
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GitExec } from "../git/exec.js";
import type { ProtectionMode } from "../git/write-context.js";
import {
  createV3DecomposePreparation,
  parseV3DecomposePreparation,
  v3DecomposeReceiptPath,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";
import {
  createV3DecomposeReceipt,
  parseV3DecomposeReceipt,
  type V3DecomposeReceipt,
  type V3ManagedPathResult,
} from "./decompose-v3-receipt.js";
import { v3PreflightId } from "./decompose-v3-schema.js";
import {
  decomposeCandidateBranch,
  decomposeTransientClaimId,
  restateDecomposeTransientClaimBinding,
  type DecomposeTransientClaim,
} from "./decompose-transient-claim.js";
import {
  createNodeDecomposeTransientClaimStore,
  type DecomposeTransientClaimStore,
} from "./decompose-transient-claim-store.js";
import {
  changedPaths,
  readAncestry,
  readTreeEntry,
  resolveCommit,
  stateMatches,
} from "./git-decomposition-object-readers.js";
import {
  composeGitV3RepositoryPlan,
  type GitV3RepositoryPlanDependencies,
  type GitV3RepositoryPlanResult,
} from "./git-decompose-v3-repository-plan.js";
import {
  createGitV3DecomposePreflight,
  readGitV3DecomposeTreeSnapshot,
  type GitV3DecomposePreflightResult,
} from "./git-decompose-v3-preflight.js";
import {
  validateBoundDescendantBaseLanding,
  type DescendantBaseLandingResult,
} from "./validate-descendant-base-landing.js";
import {
  validateFinalizedV3Decomposition,
  type ValidatedFinalizedV3Decomposition,
  type V3DecompositionMismatch,
} from "./validate-v3-decomposition.js";
import { deriveV3DestinationOutputs } from "./decompose-retirement-driver.js";
import {
  createV3DecomposeBaseAdvancementRecoveryFacts,
  mapV3DecomposeFinalizationRecovery,
  renderV3DecomposeFinalizationRecovery,
  type V3DecomposeFinalizationRecovery,
  type V3DecomposeFinalizationRecoveryCause,
} from "./decompose-finalization-recovery.js";
import type { V3PlanCanonicalPathState } from "./decompose-v3-plan.js";

export interface GitV3DecomposeBaseAdvancementDependencies extends GitV3RepositoryPlanDependencies {
  claimStore?: DecomposeTransientClaimStore;
  createPreflight?: (
    baseBranch: string,
    origin: string,
  ) => Promise<GitV3DecomposePreflightResult>;
  composePlan?: (
    baseBranch: string,
    completedMap: unknown,
  ) => Promise<GitV3RepositoryPlanResult>;
  validateLanding?: (
    receipt: V3DecomposeReceipt,
    baseRef: string,
    candidateRef: string,
  ) => Promise<DescendantBaseLandingResult>;
  rederive?: (
    receipt: V3DecomposeReceipt,
    baseHead: string,
  ) => Promise<{
    preparation: V3DecomposePreparation;
    plan: Extract<GitV3RepositoryPlanResult, { status: "composed" }>;
  } | null>;
  writeCandidateFile?: (cwd: string, path: string, bytes: Uint8Array) => Promise<void>;
}

export interface GitV3DecomposeBaseAdvancementInput {
  protection: ProtectionMode;
  baseBranch: string;
  origin: string;
  receiptId: string;
}

export interface AdmittedGitV3DecomposeBaseAdvancement {
  status: "admitted";
  receipt: V3DecomposeReceipt;
  validation: ValidatedFinalizedV3Decomposition;
  claim: DecomposeTransientClaim;
  candidatePath: string;
  candidateHead: string;
  previousBaseHead: string;
  currentBaseHead: string;
  preparation: V3DecomposePreparation;
  plan: Extract<GitV3RepositoryPlanResult, { status: "composed" }>;
}

export type GitV3DecomposeBaseAdvancementAdmission =
  | AdmittedGitV3DecomposeBaseAdvancement
  | {
      status: "unchanged";
      receiptId: CanonicalDigest;
      currentBaseHead: string;
      candidateHead: string;
    }
  | {
      status: "refused";
      reason: string;
      recovery: V3DecomposeFinalizationRecovery;
      remedy: string;
      mismatch?: V3DecompositionMismatch;
    };

export type GitV3DecomposeBaseAdvancementResult =
  | {
      status: "advanced";
      receiptId: CanonicalDigest;
      previousBaseHead: string;
      currentBaseHead: string;
      candidateHead: string;
    }
  | Exclude<GitV3DecomposeBaseAdvancementAdmission, { status: "admitted" }>;

function refusal(
  input: GitV3DecomposeBaseAdvancementInput,
  reason: string,
  cause: V3DecomposeFinalizationRecoveryCause,
  mismatch?: V3DecompositionMismatch,
): Extract<GitV3DecomposeBaseAdvancementAdmission, { status: "refused" }> {
  const facts = createV3DecomposeBaseAdvancementRecoveryFacts(input.origin, input.receiptId);
  const recovery = mapV3DecomposeFinalizationRecovery({ cause, facts });
  return {
    status: "refused",
    reason,
    recovery,
    remedy: renderV3DecomposeFinalizationRecovery(recovery),
    ...(mismatch === undefined ? {} : { mismatch }),
  };
}

function guidance(message: string): V3DecomposeFinalizationRecoveryCause {
  return { kind: "manual-guidance", message };
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function indexPathState(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  candidatePath: string,
  path: string,
): Promise<V3PlanCanonicalPathState | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["ls-files", "--stage", "-z", "--", path],
      { cwd: candidatePath },
    );
    if (stdout === "") return { kind: "absent" };
    const records = stdout.split("\0").filter(Boolean);
    if (records.length !== 1) return null;
    const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(records[0] ?? "");
    if ((match?.[1] !== "100644" && match?.[1] !== "100755") || match[2] === undefined) return null;
    const bytes = await dependencies.readObject(match[2], "blob");
    return {
      kind: "file",
      mode: match[1],
      contentDigest: digestBytes(bytes),
    };
  } catch {
    return null;
  }
}

async function committedPathState(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  ref: string,
  path: string,
): Promise<V3PlanCanonicalPathState | null> {
  const entry = await readTreeEntry(
    async (command, args, options) => await dependencies.exec(command, args, {
      ...options,
      cwd: options?.cwd ?? dependencies.cwd,
    }),
    ref,
    path,
  );
  if (entry === null) return { kind: "absent" };
  if (entry === false || entry.type !== "blob"
    || (entry.mode !== "100644" && entry.mode !== "100755")) return null;
  try {
    return {
      kind: "file",
      mode: entry.mode,
      contentDigest: digestBytes(await dependencies.readObject(entry.oid, "blob")),
    };
  } catch {
    return null;
  }
}

function projectedAfter(
  admission: AdmittedGitV3DecomposeBaseAdvancement,
  path: string,
): V3PlanCanonicalPathState | null {
  return admission.plan.plan.mutations.find((mutation) => mutation.path === path)?.after ?? null;
}

function projectionBytes(
  admission: AdmittedGitV3DecomposeBaseAdvancement,
): { path: string; bytes: Uint8Array } | null {
  const roadmap = admission.plan.plan.roadmap;
  if (roadmap === null || roadmap.after.kind !== "file") return null;
  const projectionDigest = roadmap.after.contentDigest;
  const blob = admission.plan.blobs.find(({ contentDigest }) =>
    contentDigest === projectionDigest);
  return blob === undefined ? null : { path: roadmap.path, bytes: new Uint8Array(blob.bytes) };
}

async function writeAndStage(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  candidatePath: string,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  if (dependencies.writeCandidateFile === undefined) {
    await writeFile(join(candidatePath, path), bytes);
  } else {
    await dependencies.writeCandidateFile(candidatePath, path, bytes);
  }
  await dependencies.exec("git", ["add", "--", path], { cwd: candidatePath });
}

async function restoreCandidate(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  admission: AdmittedGitV3DecomposeBaseAdvancement,
): Promise<boolean> {
  try {
    await dependencies.exec("git", ["merge", "--abort"], { cwd: admission.candidatePath });
  } catch {
    // A failed/interrupted merge may not have installed MERGE_HEAD; the exact reset below is authoritative.
  }
  try {
    await dependencies.exec(
      "git",
      ["reset", "--hard", admission.candidateHead],
      { cwd: admission.candidatePath },
    );
    return await candidateIsClean(
      dependencies,
      admission.candidatePath,
      admission.claim.binding.candidateBranch,
      admission.candidateHead,
    );
  } catch {
    return false;
  }
}

async function unexpectedConflicts(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  admission: AdmittedGitV3DecomposeBaseAdvancement,
  projectionPath: string,
): Promise<boolean> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["diff", "--name-only", "--diff-filter=U", "-z"],
      { cwd: admission.candidatePath },
    );
    const conflicts = stdout.split("\0").filter(Boolean);
    return conflicts.some((path) => path !== projectionPath) || conflicts.length === 0;
  } catch {
    return true;
  }
}

async function mergePinnedBase(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  input: GitV3DecomposeBaseAdvancementInput,
  admission: AdmittedGitV3DecomposeBaseAdvancement,
  projectionPath: string,
): Promise<"merged" | "raced" | "failed"> {
  const [baseReread, candidateReread] = await Promise.all([
    exactCommit(dependencies.exec, dependencies.cwd, input.baseBranch),
    exactCommit(dependencies.exec, dependencies.cwd, admission.claim.binding.candidateBranch),
  ]);
  if (baseReread !== admission.currentBaseHead || candidateReread !== admission.candidateHead) return "raced";
  if (!await candidateIsClean(
    dependencies,
    admission.candidatePath,
    admission.claim.binding.candidateBranch,
    admission.candidateHead,
  )) return "raced";
  try {
    await dependencies.exec(
      "git",
      ["merge", "--no-commit", "--no-ff", admission.currentBaseHead],
      { cwd: admission.candidatePath },
    );
  } catch {
    if (await unexpectedConflicts(dependencies, admission, projectionPath)) return "failed";
  }
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-parse", "--verify", "MERGE_HEAD"],
      { cwd: admission.candidatePath },
    );
    return stdout.trim() === admission.currentBaseHead ? "merged" : "failed";
  } catch {
    return "failed";
  }
}

async function sealAdvancedReceipt(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  admission: AdmittedGitV3DecomposeBaseAdvancement,
  projection: { path: string; bytes: Uint8Array },
): Promise<V3DecomposeReceipt | null> {
  await writeAndStage(
    dependencies,
    admission.candidatePath,
    projection.path,
    projection.bytes,
  );
  const receiptPath = v3DecomposeReceiptPath(admission.receipt.receiptId);
  const managedPaths = admission.preparation.facts.allowedPaths
    .filter((path) => path !== receiptPath)
    .sort(compareUtf8);
  const managedPathResults: V3ManagedPathResult[] = [];
  for (const path of managedPaths) {
    const [before, after] = await Promise.all([
      committedPathState(dependencies, admission.currentBaseHead, path),
      indexPathState(dependencies, admission.candidatePath, path),
    ]);
    const expected = projectedAfter(admission, path);
    if (before === null || after === null || expected === null
      || canonicalize(after) !== canonicalize(expected)) return null;
    managedPathResults.push({ path, before, after });
  }
  const destinationOutputs = deriveV3DestinationOutputs(
    admission.preparation,
    managedPathResults,
  );
  if (destinationOutputs === null) return null;
  const receipt = createV3DecomposeReceipt(
    admission.preparation,
    managedPathResults,
    destinationOutputs,
    admission.receipt.finalized.publication.initialContinuation,
  );
  if (receipt === null || receipt.receiptId !== admission.receipt.receiptId) return null;
  const existingState = await indexPathState(
    dependencies,
    admission.candidatePath,
    receiptPath,
  );
  const existingDigest = digestBytes(new TextEncoder().encode(canonicalize(admission.receipt)));
  if (existingState?.kind !== "file" || existingState.mode !== "100644"
    || existingState.contentDigest !== existingDigest) return null;
  await writeAndStage(
    dependencies,
    admission.candidatePath,
    receiptPath,
    new TextEncoder().encode(canonicalize(receipt)),
  );
  return receipt;
}

async function exactCommit(exec: GitExec, cwd: string, ref: string): Promise<string | null> {
  return await resolveCommit(async (command, args, options) => await exec(command, args, {
    ...options,
    cwd: options?.cwd ?? cwd,
  }), ref);
}

async function readCandidateReceipt(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  candidateHead: string,
  receiptId: CanonicalDigest,
): Promise<V3DecomposeReceipt | null> {
  try {
    const bytes = await dependencies.readBlob(candidateHead, v3DecomposeReceiptPath(receiptId));
    if (bytes === null) return null;
    return parseV3DecomposeReceipt(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
}

function preparationFor(receipt: V3DecomposeReceipt): V3DecomposePreparation | null {
  return parseV3DecomposePreparation({
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  });
}

function claimMatchesReceipt(
  claim: DecomposeTransientClaim,
  receipt: V3DecomposeReceipt,
  origin: string,
  candidateBranch: string,
): boolean {
  const ownership = receipt.prepared.candidateOwnership;
  return claim.state.kind === "occupied"
    && claim.registration.kind === "registered"
    && claim.binding.origin === origin
    && claim.binding.candidateBranch === candidateBranch
    && claim.binding.sourceHead === receipt.prepared.completedMap.machine.source.head
    && claim.binding.resultBaseHead === receipt.prepared.completedMap.machine.resultBase.head
    && claim.binding.cutMapDigest === receipt.prepared.cutMapDigest
    && ownership.kind === "claimed"
    && ownership.claimId === claim.claimId
    && ownership.generation === claim.generation
    && ownership.candidateBranch === claim.binding.candidateBranch
    && ownership.candidateWorktree === claim.candidateWorktree;
}

async function candidateIsClean(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  candidatePath: string,
  candidateBranch: string,
  candidateHead: string,
): Promise<boolean> {
  try {
    const [head, branch, status] = await Promise.all([
      dependencies.exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: candidatePath }),
      dependencies.exec("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: candidatePath }),
      dependencies.exec(
        "git",
        ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
        { cwd: candidatePath },
      ),
    ]);
    return head.stdout.trim() === candidateHead
      && branch.stdout.trim() === candidateBranch
      && status.stdout === "";
  } catch {
    return false;
  }
}

async function canonicalValidation(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  input: GitV3DecomposeBaseAdvancementInput,
  receipt: V3DecomposeReceipt,
): Promise<ValidatedFinalizedV3Decomposition | null> {
  const preparation = preparationFor(receipt);
  if (preparation === null) return null;
  const preflight = dependencies.createPreflight === undefined
    ? await createGitV3DecomposePreflight(dependencies, input.baseBranch, input.origin)
    : await dependencies.createPreflight(input.baseBranch, input.origin);
  if (preflight.status !== "ready") return null;
  const destinationOutputs = receipt.finalized.destinationDigests.map(({ destinationId, outputs }) => ({
    destinationId,
    outputs,
  }));
  const validation = validateFinalizedV3Decomposition({
    preparation,
    receipt,
    sourceArtifactDigest: preparation.facts.sourceArtifactDigest,
    sourceArtifactInventory: preflight.preflight.sourceArtifactInventory,
    sourceUnits: preparation.facts.completedMap.machine.sourceUnits,
    sourceAllocations: preparation.facts.completedMap.authoring.sourceAllocations,
    resultBaseHead: preparation.facts.completedMap.machine.resultBase.head,
    candidateOwnership: preparation.facts.candidateOwnership,
    destinationOutputs,
    incomingEdges: preparation.facts.completedMap.machine.incomingEdges,
    outgoingEdges: preparation.facts.completedMap.machine.outgoingEdges,
    managedPathResults: receipt.finalized.managedPathResults,
    transitionPatch: receipt.finalized.transitionPatch,
    topology: preparation.facts.topology,
    publication: receipt.finalized.publication,
  });
  return validation.status === "validated" ? validation.authority : null;
}

async function landingValidation(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  receipt: V3DecomposeReceipt,
  baseRef: string,
  candidateRef: string,
): Promise<DescendantBaseLandingResult> {
  if (dependencies.validateLanding !== undefined) {
    return await dependencies.validateLanding(receipt, baseRef, candidateRef);
  }
  const objectExec: GitExec = async (command, args, options) => await dependencies.exec(command, args, {
    ...options,
    cwd: options?.cwd ?? dependencies.cwd,
  });
  return await validateBoundDescendantBaseLanding({
    receipt,
    currentBaseRef: baseRef,
    candidateHeadRef: candidateRef,
  }, {
    objects: {
      resolveCommit: async (ref) => await resolveCommit(objectExec, ref),
      readAncestry: async (ancestor, descendant) => await readAncestry(objectExec, ancestor, descendant),
      readTreeEntry: async (ref, path) => await readTreeEntry(objectExec, ref, path),
      stateMatches: async (ref, path, expected) => await stateMatches({
        exec: objectExec,
        readBlob: async (oid) => await dependencies.readObject(oid, "blob"),
      }, ref, path, expected),
      changedPaths: async (before, after) => await changedPaths(objectExec, before, after),
      readBlob: async (oid) => await dependencies.readObject(oid, "blob"),
    },
    dependencies: {
      readSnapshot: async (ref, head, origin) => await readGitV3DecomposeTreeSnapshot(
        dependencies,
        ref,
        head,
        origin,
      ),
    },
  });
}

function restatedCompletedMap(receipt: V3DecomposeReceipt, baseHead: string) {
  const prior = receipt.prepared.completedMap;
  const restatedFacts = {
    source: prior.machine.source,
    resultBase: { ...prior.machine.resultBase, head: baseHead },
    planningProfile: prior.machine.planningProfile,
    sourceUnits: prior.machine.sourceUnits,
    incomingEdges: prior.machine.incomingEdges,
    outgoingEdges: prior.machine.outgoingEdges,
  };
  return {
    ...prior,
    machine: { preflightId: v3PreflightId(restatedFacts), ...restatedFacts },
  };
}

async function rederivePreparation(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  input: GitV3DecomposeBaseAdvancementInput,
  receipt: V3DecomposeReceipt,
  baseHead: string,
): Promise<{
  preparation: V3DecomposePreparation;
  plan: Extract<GitV3RepositoryPlanResult, { status: "composed" }>;
} | null> {
  const completedMap = restatedCompletedMap(receipt, baseHead);
  if (canonicalize(completedMap.authoring) !== canonicalize(receipt.prepared.completedMap.authoring)) return null;
  const composed = dependencies.composePlan === undefined
    ? await composeGitV3RepositoryPlan(dependencies, input.baseBranch, completedMap)
    : await dependencies.composePlan(input.baseBranch, completedMap);
  if (composed.status !== "composed") return null;
  const prepared = createV3DecomposePreparation({
    completedMap,
    sourceArtifactInventory: composed.sourceArtifactInventory,
    candidateOwnership: receipt.prepared.candidateOwnership,
    plan: composed.plan,
  });
  if (prepared.status !== "ready"
    || prepared.preparation.receiptId !== receipt.receiptId
    || parseV3DecomposePreparation(prepared.preparation) === null) return null;
  return { preparation: prepared.preparation, plan: composed };
}

/** Establish the complete committed-candidate advancement decision without mutation. */
export async function prepareGitV3DecomposeBaseAdvancement(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  input: GitV3DecomposeBaseAdvancementInput,
): Promise<GitV3DecomposeBaseAdvancementAdmission> {
  if (input.protection !== "full") {
    return refusal(
      input,
      "full-protection-required",
      guidance("Enable full protection before advancing a committed candidate."),
    );
  }
  if (!isCanonicalDigest(input.receiptId)) {
    return refusal(
      input,
      "receipt-id-invalid",
      guidance("Supply the canonical receipt id committed on the decomposition candidate."),
    );
  }
  const receiptId = input.receiptId;
  const candidateBranch = decomposeCandidateBranch(input.origin);
  const claimId = decomposeTransientClaimId({ origin: input.origin, candidateBranch });
  const claims = dependencies.claimStore
    ?? await createNodeDecomposeTransientClaimStore(dependencies.exec, dependencies.cwd);
  const storedClaim = await claims.read(claimId);
  if (storedClaim.status !== "found") {
    return refusal(
      input,
      "candidate-claim-unavailable",
      guidance("Restore the live full-protection candidate claim before advancing its base."),
    );
  }
  const claim = storedClaim.claim;
  if (claim.registration.kind !== "registered") {
    return refusal(
      input,
      "candidate-generation-mismatch",
      guidance("Use the live registered candidate generation for this origin."),
    );
  }
  const candidatePath = claim.registration.path;
  const [candidateHead, baseHead] = await Promise.all([
    exactCommit(dependencies.exec, dependencies.cwd, candidateBranch),
    exactCommit(dependencies.exec, dependencies.cwd, input.baseBranch),
  ]);
  if (candidateHead === null || baseHead === null) {
    return refusal(input, "binding-unavailable", { kind: "binding-unavailable" });
  }
  const receipt = await readCandidateReceipt(dependencies, candidateHead, receiptId);
  if (receipt === null || receipt.receiptId !== receiptId
    || receipt.prepared.completedMap.machine.source.origin !== input.origin) {
    return refusal(
      input,
      "receipt-unavailable",
      guidance("Supply the canonical live receipt committed on the decomposition candidate."),
    );
  }
  if (receipt.prepared.completedMap.machine.source.ref
    === receipt.prepared.completedMap.machine.resultBase.ref) {
    return refusal(
      input,
      "source-ref-is-result-base",
      guidance("Re-preflight from a source branch independent of the configured result base."),
    );
  }
  if (!claimMatchesReceipt(claim, receipt, input.origin, candidateBranch)) {
    return refusal(
      input,
      "candidate-generation-mismatch",
      guidance("Use the live candidate generation bound to this exact receipt."),
    );
  }
  if (!await candidateIsClean(
    dependencies,
    candidatePath,
    candidateBranch,
    candidateHead,
  )) {
    return refusal(
      input,
      "candidate-dirty",
      guidance("Restore the candidate worktree and index to its committed receipt before advancing."),
    );
  }
  const reachable = await readAncestry(
    async (command, args, options) => await dependencies.exec(command, args, {
      ...options,
      cwd: options?.cwd ?? dependencies.cwd,
    }),
    candidateHead,
    baseHead,
  );
  if (reachable === "ancestor") {
    return refusal(
      input,
      "candidate-already-landed",
      guidance("Use landed decomposition cleanup instead of base advancement."),
    );
  }
  if (reachable === "unresolvable") {
    return refusal(input, "binding-unavailable", { kind: "binding-unavailable" });
  }
  const validation = await canonicalValidation(dependencies, input, receipt);
  if (validation === null) {
    return refusal(
      input,
      "canonical-validation-refused",
      guidance("Repair or re-preflight the candidate's canonical decomposition evidence."),
    );
  }
  const landing = await landingValidation(dependencies, receipt, input.baseBranch, candidateBranch);
  if (landing.status === "refused") {
    if (landing.mismatch.kind === "base" && landing.mismatch.locus === "binding-unavailable") {
      return refusal(
        input,
        "binding-unavailable",
        { kind: "binding-unavailable" },
        landing.mismatch,
      );
    }
    return refusal(
      input,
      "landing-validation-refused",
      { kind: "canonical-mismatch", mismatch: landing.mismatch },
      landing.mismatch,
    );
  }
  if (landing.binding.currentBaseOid !== baseHead
    || landing.binding.candidateHeadOid !== candidateHead) {
    return refusal(input, "binding-unavailable", { kind: "binding-unavailable" });
  }
  const previousBaseHead = receipt.prepared.completedMap.machine.resultBase.head;
  if (previousBaseHead === baseHead) {
    return { status: "unchanged", receiptId, currentBaseHead: baseHead, candidateHead };
  }
  const rederived = dependencies.rederive === undefined
    ? await rederivePreparation(dependencies, input, receipt, baseHead)
    : await dependencies.rederive(receipt, baseHead);
  if (rederived === null) {
    return refusal(
      input,
      "advancement-rederivation-refused",
      { kind: "mechanical-repreflight" },
    );
  }
  return {
    status: "admitted",
    receipt,
    validation,
    claim,
    candidatePath,
    candidateHead,
    previousBaseHead,
    currentBaseHead: baseHead,
    preparation: rederived.preparation,
    plan: rederived.plan,
  };
}

/** Advance one full-protection committed candidate without rewriting history. */
export async function advanceGitV3DecomposeBase(
  dependencies: GitV3DecomposeBaseAdvancementDependencies,
  input: GitV3DecomposeBaseAdvancementInput,
): Promise<GitV3DecomposeBaseAdvancementResult> {
  const admission = await prepareGitV3DecomposeBaseAdvancement(dependencies, input);
  if (admission.status !== "admitted") return admission;
  const projection = projectionBytes(admission);
  if (projection === null) {
    return refusal(
      input,
      "projection-unavailable",
      { kind: "mechanical-repreflight" },
    );
  }
  const merged = await mergePinnedBase(dependencies, input, admission, projection.path);
  if (merged === "raced") {
    return refusal(input, "binding-unavailable", { kind: "binding-unavailable" });
  }
  if (merged === "failed") {
    const restored = await restoreCandidate(dependencies, admission);
    return refusal(
      input,
      restored ? "merge-refused" : "candidate-restore-failed",
      guidance(restored
        ? "Resolve the unexpected non-projection conflict before retrying advancement."
        : "Repair the candidate worktree back to its pinned pre-merge commit before continuing."),
    );
  }
  let receipt: V3DecomposeReceipt | null;
  try {
    receipt = await sealAdvancedReceipt(dependencies, admission, projection);
  } catch {
    receipt = null;
  }
  if (receipt === null) {
    const restored = await restoreCandidate(dependencies, admission);
    return refusal(
      input,
      restored ? "receipt-seal-refused" : "candidate-restore-failed",
      guidance(restored
        ? "Re-preflight because the merged candidate diverged from the advanced projection."
        : "Repair the candidate worktree back to its pinned pre-merge commit before continuing."),
    );
  }
  const claims = dependencies.claimStore
    ?? await createNodeDecomposeTransientClaimStore(dependencies.exec, dependencies.cwd);
  const nextBinding = {
    resultBaseHead: admission.preparation.facts.completedMap.machine.resultBase.head,
    cutMapDigest: admission.preparation.facts.cutMapDigest,
  };
  let claimRestated: boolean;
  try {
    const restated = await claims.restateBinding(
      admission.claim.claimId,
      admission.claim.generation,
      admission.claim.binding,
      nextBinding,
    );
    claimRestated = restated.status === "restated" || restated.status === "already-restated-matching";
  } catch {
    try {
      const persisted = await claims.read(admission.claim.claimId);
      const reconciled = persisted.status === "found"
        ? restateDecomposeTransientClaimBinding(
            persisted.claim,
            admission.claim.claimId,
            admission.claim.generation,
            admission.claim.binding,
            nextBinding,
          )
        : null;
      claimRestated = reconciled?.status === "already-restated-matching";
    } catch {
      claimRestated = false;
    }
  }
  if (!claimRestated) {
    const restored = await restoreCandidate(dependencies, admission);
    return refusal(
      input,
      restored ? "claim-binding-refused" : "candidate-restore-failed",
      guidance(restored
        ? "Restore the exact live candidate claim before retrying advancement."
        : "Repair the candidate worktree back to its pinned pre-merge commit before continuing."),
    );
  }
  return {
    status: "advanced",
    receiptId: receipt.receiptId,
    previousBaseHead: admission.previousBaseHead,
    currentBaseHead: admission.currentBaseHead,
    candidateHead: admission.candidateHead,
  };
}
