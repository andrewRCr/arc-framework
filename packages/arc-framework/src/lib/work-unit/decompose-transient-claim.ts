/** Pure compare-and-set machine for one machine-local decomposition candidate claim. */

import { isAbsolute, normalize } from "node:path";

import { z } from "zod";

import {
  canonicalDigest,
  canonicalize,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";

const DigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");
const NonEmptyStringSchema = z.string().refine((value) => value.trim() !== "", "must be non-empty");
const HostPathSchema = z.string().refine(
  (value) => value !== "" && !value.includes("\0") && isAbsolute(value)
    && normalize(value) === value && value.normalize("NFC") === value,
  "must be a canonical absolute host path",
);

const RegistrationSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unregistered") }),
  z.strictObject({ kind: z.literal("intended"), path: HostPathSchema }),
  z.strictObject({ kind: z.literal("registered"), path: HostPathSchema }),
  z.strictObject({ kind: z.literal("released"), lastPath: HostPathSchema }),
]);
const BindingSchema = z.strictObject({
  origin: SlugSchema.transform((value): string => value),
  candidateBranch: NonEmptyStringSchema,
  sourceHead: NonEmptyStringSchema,
  resultBaseHead: NonEmptyStringSchema,
  cutMapDigest: DigestSchema,
});
const TerminalSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("landed"),
    receiptId: DigestSchema,
    candidateHead: NonEmptyStringSchema,
  }),
  z.strictObject({
    kind: z.literal("discarded"),
    planId: DigestSchema,
    candidateHead: NonEmptyStringSchema,
  }),
]);
const StateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("pending") }),
  z.strictObject({ kind: z.literal("occupied") }),
  z.strictObject({ kind: z.literal("terminal"), terminal: TerminalSchema }),
]);

export const DecomposeTransientClaimSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("decomposition-candidate"),
  claimId: DigestSchema,
  generation: z.number().int().positive(),
  binding: BindingSchema,
  candidateWorktree: DigestSchema,
  state: StateSchema,
  registration: RegistrationSchema,
});

export type DecomposeTransientClaim = z.infer<typeof DecomposeTransientClaimSchema>;
export type DecomposeTransientClaimBinding = z.infer<typeof BindingSchema>;
export type DecomposeTransientTerminal = z.infer<typeof TerminalSchema>;

export interface DecomposeTransientOccupationEvidence {
  registrations: Array<{
    path: string;
    candidateBranch: string;
    head: string;
  }>;
  branch: {
    candidateBranch: string;
    head: string;
  };
  marker: {
    claimId: CanonicalDigest;
    generation: number;
    candidateWorktree: CanonicalDigest;
  };
}

export interface DecomposeTransientReleaseEvidence {
  registrationAbsent: boolean;
  markerAbsent: boolean;
  branchOccupationAbsent: boolean;
}

export interface DecomposeTransientReservationRollbackEvidence {
  registrationAbsent: boolean;
  markerAbsent: boolean;
  branchAbsent: boolean;
  pathAbsent: boolean;
}

type ClaimConflictReason =
  | "absence-unproven"
  | "binding-mismatch"
  | "branch-not-exact"
  | "claim-id-mismatch"
  | "generation-mismatch"
  | "invalid-host-path"
  | "invalid-state"
  | "malformed-claim"
  | "marker-not-exact"
  | "registration-mismatch"
  | "registration-not-exact"
  | "registration-not-released"
  | "terminal-mismatch"
  | "worktree-mismatch";

interface ClaimConflict {
  status: "conflict";
  reason: ClaimConflictReason;
}

export type DecomposeTransientAcquireResult =
  | { status: "acquired"; claim: DecomposeTransientClaim }
  | { status: "already-acquired-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

export type DecomposeTransientReserveResult =
  | { status: "reserved"; claim: DecomposeTransientClaim }
  | { status: "already-reserved-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

export type DecomposeTransientOccupyResult =
  | { status: "occupied"; claim: DecomposeTransientClaim }
  | { status: "already-occupied-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

export type DecomposeTransientRetireResult =
  | { status: "retired"; claim: DecomposeTransientClaim }
  | { status: "already-retired-matching"; claim: DecomposeTransientClaim }
  | { status: "missing-unproven"; reason: "claim-missing" }
  | ClaimConflict;

export type DecomposeTransientRestateBindingResult =
  | { status: "restated"; claim: DecomposeTransientClaim }
  | { status: "already-restated-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

export type DecomposeTransientReleaseResult =
  | { status: "released"; claim: DecomposeTransientClaim }
  | { status: "already-released-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

export type DecomposeTransientReservationRollbackResult =
  | { status: "rolled-back"; claim: DecomposeTransientClaim }
  | { status: "already-unregistered-matching"; claim: DecomposeTransientClaim }
  | ClaimConflict;

function registrationMatchesState(claim: DecomposeTransientClaim): boolean {
  if (claim.state.kind === "pending") {
    return claim.registration.kind === "unregistered" || claim.registration.kind === "intended";
  }
  if (claim.state.kind === "occupied") return claim.registration.kind === "registered";
  return claim.registration.kind === "registered" || claim.registration.kind === "released";
}

function candidateWorktreeId(claimId: CanonicalDigest, generation: number): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: 1,
    kind: "decomposition-candidate-worktree",
    claimId,
    generation,
  });
}

/**
 * Derive the one repository-common candidate branch for an origin.
 *
 * @param origin - Canonical decomposition origin slug
 * @returns The transient candidate branch name
 */
export function decomposeCandidateBranch(origin: string): string {
  return `chore/decompose-${origin}`;
}

/** Derive the repository-common operational key without including any host path. */
export function decomposeTransientClaimId(
  binding: Pick<DecomposeTransientClaimBinding, "origin" | "candidateBranch">,
): CanonicalDigest {
  return canonicalDigest({
    schemaVersion: 1,
    kind: "decomposition-candidate",
    origin: binding.origin,
    candidateBranch: binding.candidateBranch,
  });
}

/** Decode a closed claim and rederive both canonical identities. */
export function parseDecomposeTransientClaim(input: unknown): DecomposeTransientClaim | null {
  let candidate = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
      if (canonicalize(candidate) !== input) return null;
    } catch {
      return null;
    }
  }
  const parsed = DecomposeTransientClaimSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const claim = parsed.data;
  if (claim.claimId !== decomposeTransientClaimId(claim.binding)
    || claim.candidateWorktree !== candidateWorktreeId(claim.claimId, claim.generation)
    || !registrationMatchesState(claim)) return null;
  return claim;
}

/**
 * Project one validated claim into preparation ownership without host-path state.
 *
 * @param input - Untrusted stored claim bytes or value.
 * @returns Exact full-protection ownership, or null when the claim is not canonical.
 */
export function projectDecomposeTransientCandidateOwnership(input: unknown): {
  kind: "claimed";
  protection: "full";
  claimId: CanonicalDigest;
  generation: number;
  candidateBranch: string;
  candidateWorktree: CanonicalDigest;
} | null {
  const claim = parseDecomposeTransientClaim(input);
  return claim === null ? null : {
    kind: "claimed",
    protection: "full",
    claimId: claim.claimId,
    generation: claim.generation,
    candidateBranch: claim.binding.candidateBranch,
    candidateWorktree: claim.candidateWorktree,
  };
}

/** Project only unambiguously live, path-addressable candidate branches for residue readers. */
export function projectLiveDecomposeCandidateBranches(inputs: readonly unknown[]): Set<string> {
  const byBranch = new Map<string, number>();
  const claims = inputs.map(parseDecomposeTransientClaim);
  for (const claim of claims) {
    if (claim === null || claim.registration.kind === "unregistered"
      || claim.registration.kind === "released") continue;
    const branch = claim.binding.candidateBranch;
    byBranch.set(branch, (byBranch.get(branch) ?? 0) + 1);
  }
  return new Set(
    [...byBranch.entries()]
      .filter(([, count]) => count === 1)
      .map(([branch]) => branch),
  );
}

function bindingMatches(
  claim: DecomposeTransientClaim,
  binding: DecomposeTransientClaimBinding,
): boolean {
  return canonicalDigest(claim.binding) === canonicalDigest(binding);
}

function exactClaim(
  current: unknown,
  claimId: CanonicalDigest,
  generation: number,
): DecomposeTransientClaim | ClaimConflict {
  const claim = parseDecomposeTransientClaim(current);
  if (claim === null) return { status: "conflict", reason: "malformed-claim" };
  if (claim.claimId !== claimId) return { status: "conflict", reason: "claim-id-mismatch" };
  if (claim.generation !== generation) return { status: "conflict", reason: "generation-mismatch" };
  return claim;
}

function validBinding(binding: DecomposeTransientClaimBinding): boolean {
  return SlugSchema.safeParse(binding.origin).success
    && NonEmptyStringSchema.safeParse(binding.candidateBranch).success
    && NonEmptyStringSchema.safeParse(binding.sourceHead).success
    && NonEmptyStringSchema.safeParse(binding.resultBaseHead).success
    && isCanonicalDigest(binding.cutMapDigest);
}

/** Acquire generation one, retry a matching live claim, or advance one released terminal generation. */
export function acquireDecomposeTransientClaim(
  current: unknown,
  claimId: CanonicalDigest,
  binding: DecomposeTransientClaimBinding,
): DecomposeTransientAcquireResult {
  if (!validBinding(binding) || !isCanonicalDigest(claimId)
    || decomposeTransientClaimId(binding) !== claimId) {
    return { status: "conflict", reason: "claim-id-mismatch" };
  }

  let generation = 1;
  if (current !== null) {
    const claim = parseDecomposeTransientClaim(current);
    if (claim === null) return { status: "conflict", reason: "malformed-claim" };
    if (claim.claimId !== claimId) return { status: "conflict", reason: "claim-id-mismatch" };
    if (claim.state.kind === "terminal") {
      if (claim.registration.kind !== "released") {
        return { status: "conflict", reason: "registration-not-released" };
      }
      generation = claim.generation + 1;
    } else {
      if (!bindingMatches(claim, binding)) return { status: "conflict", reason: "binding-mismatch" };
      return { status: "already-acquired-matching", claim };
    }
  }

  const claim: DecomposeTransientClaim = {
    schemaVersion: 1,
    kind: "decomposition-candidate",
    claimId,
    generation,
    binding,
    candidateWorktree: candidateWorktreeId(claimId, generation),
    state: { kind: "pending" },
    registration: { kind: "unregistered" },
  };
  return { status: "acquired", claim };
}

/** Persist the adapter-only intended host path before any branch or filesystem mutation. */
export function reserveDecomposeTransientWorktree(
  current: unknown,
  claimId: CanonicalDigest,
  generation: number,
  path: string,
): DecomposeTransientReserveResult {
  if (!HostPathSchema.safeParse(path).success) return { status: "conflict", reason: "invalid-host-path" };
  const exact = exactClaim(current, claimId, generation);
  if ("status" in exact) return exact;
  if (exact.state.kind !== "pending") return { status: "conflict", reason: "invalid-state" };
  if (exact.registration.kind === "intended") {
    return exact.registration.path === path
      ? { status: "already-reserved-matching", claim: exact }
      : { status: "conflict", reason: "registration-mismatch" };
  }
  if (exact.registration.kind !== "unregistered") {
    return { status: "conflict", reason: "registration-mismatch" };
  }
  return {
    status: "reserved",
    claim: { ...exact, registration: { kind: "intended", path } },
  };
}

/** Roll back an intended reservation only when every possible observer and mutation is proven absent. */
export function rollbackDecomposeTransientWorktreeReservation(
  current: unknown,
  claimId: CanonicalDigest,
  generation: number,
  path: string,
  evidence: DecomposeTransientReservationRollbackEvidence,
): DecomposeTransientReservationRollbackResult {
  if (!HostPathSchema.safeParse(path).success) return { status: "conflict", reason: "invalid-host-path" };
  const exact = exactClaim(current, claimId, generation);
  if ("status" in exact) return exact;
  if (exact.state.kind !== "pending") return { status: "conflict", reason: "invalid-state" };
  if (exact.registration.kind === "unregistered") {
    return { status: "already-unregistered-matching", claim: exact };
  }
  if (exact.registration.kind !== "intended" || exact.registration.path !== path) {
    return { status: "conflict", reason: "registration-mismatch" };
  }
  if (!evidence.registrationAbsent || !evidence.markerAbsent
    || !evidence.branchAbsent || !evidence.pathAbsent) {
    return { status: "conflict", reason: "absence-unproven" };
  }
  return {
    status: "rolled-back",
    claim: { ...exact, registration: { kind: "unregistered" } },
  };
}

function occupationEvidenceMatches(
  claim: DecomposeTransientClaim,
  path: string,
  evidence: DecomposeTransientOccupationEvidence,
): ClaimConflictReason | null {
  if (evidence.registrations.length !== 1) return "registration-not-exact";
  const [registration] = evidence.registrations;
  if (registration === undefined) return "registration-not-exact";
  if (registration.path !== path
    || registration.candidateBranch !== claim.binding.candidateBranch
    || registration.head !== claim.binding.resultBaseHead) return "registration-not-exact";
  if (evidence.branch.candidateBranch !== claim.binding.candidateBranch
    || evidence.branch.head !== claim.binding.resultBaseHead) return "branch-not-exact";
  if (evidence.marker.claimId !== claim.claimId
    || evidence.marker.generation !== claim.generation
    || evidence.marker.candidateWorktree !== claim.candidateWorktree) return "marker-not-exact";
  return null;
}

/** Record occupation only after the adapter proves the exact Git and marker projection. */
export function occupyDecomposeTransientClaim(
  current: unknown,
  claimId: CanonicalDigest,
  generation: number,
  path: string,
  evidence: DecomposeTransientOccupationEvidence,
): DecomposeTransientOccupyResult {
  if (!HostPathSchema.safeParse(path).success) return { status: "conflict", reason: "invalid-host-path" };
  const exact = exactClaim(current, claimId, generation);
  if ("status" in exact) return exact;
  const evidenceMismatch = occupationEvidenceMatches(exact, path, evidence);
  if (evidenceMismatch !== null) return { status: "conflict", reason: evidenceMismatch };
  if (exact.state.kind === "occupied") {
    return exact.registration.kind === "registered" && exact.registration.path === path
      ? { status: "already-occupied-matching", claim: exact }
      : { status: "conflict", reason: "registration-mismatch" };
  }
  if (exact.state.kind !== "pending") return { status: "conflict", reason: "invalid-state" };
  if (exact.registration.kind !== "intended" || exact.registration.path !== path) {
    return { status: "conflict", reason: "registration-mismatch" };
  }
  return {
    status: "occupied",
    claim: {
      ...exact,
      state: { kind: "occupied" },
      registration: { kind: "registered", path },
    },
  };
}

/** Seal an occupied generation while preserving its registration for cleanup. */
export function retireDecomposeTransientClaim(
  current: unknown,
  claimId: CanonicalDigest,
  expectedGeneration: number,
  terminal: DecomposeTransientTerminal,
): DecomposeTransientRetireResult {
  if (current === null) return { status: "missing-unproven", reason: "claim-missing" };
  const exact = exactClaim(current, claimId, expectedGeneration);
  if ("status" in exact) return exact;
  if (exact.state.kind === "terminal") {
    return canonicalDigest(exact.state.terminal) === canonicalDigest(terminal)
      ? { status: "already-retired-matching", claim: exact }
      : { status: "conflict", reason: "terminal-mismatch" };
  }
  if (exact.state.kind !== "occupied" || exact.registration.kind !== "registered") {
    return { status: "conflict", reason: "invalid-state" };
  }
  return { status: "retired", claim: { ...exact, state: { kind: "terminal", terminal } } };
}

/** Restate only the base-derived binding pair on one exact live candidate generation. */
export function restateDecomposeTransientClaimBinding(
  current: unknown,
  claimId: CanonicalDigest,
  expectedGeneration: number,
  expectedBinding: DecomposeTransientClaimBinding,
  next: Pick<DecomposeTransientClaimBinding, "resultBaseHead" | "cutMapDigest">,
): DecomposeTransientRestateBindingResult {
  const exact = exactClaim(current, claimId, expectedGeneration);
  if ("status" in exact) return exact;
  if (exact.state.kind !== "occupied" || exact.registration.kind !== "registered") {
    return { status: "conflict", reason: "invalid-state" };
  }
  const nextBinding = {
    ...expectedBinding,
    resultBaseHead: next.resultBaseHead,
    cutMapDigest: next.cutMapDigest,
  };
  if (!validBinding(expectedBinding) || !validBinding(nextBinding)) {
    return { status: "conflict", reason: "binding-mismatch" };
  }
  if (bindingMatches(exact, nextBinding)) {
    return { status: "already-restated-matching", claim: exact };
  }
  if (!bindingMatches(exact, expectedBinding)) {
    return { status: "conflict", reason: "binding-mismatch" };
  }
  return { status: "restated", claim: { ...exact, binding: nextBinding } };
}

/** Release adapter registration only after exact terminal authority and proven local absence. */
export function releaseDecomposeTransientWorktree(
  current: unknown,
  claimId: CanonicalDigest,
  generation: number,
  candidateWorktree: CanonicalDigest,
  path: string,
  evidence: DecomposeTransientReleaseEvidence,
): DecomposeTransientReleaseResult {
  if (!HostPathSchema.safeParse(path).success) return { status: "conflict", reason: "invalid-host-path" };
  const exact = exactClaim(current, claimId, generation);
  if ("status" in exact) return exact;
  if (exact.candidateWorktree !== candidateWorktree) {
    return { status: "conflict", reason: "worktree-mismatch" };
  }
  if (exact.state.kind !== "terminal") {
    return { status: "conflict", reason: "invalid-state" };
  }
  if (exact.registration.kind === "released") {
    return exact.registration.lastPath === path
      ? { status: "already-released-matching", claim: exact }
      : { status: "conflict", reason: "registration-mismatch" };
  }
  if (exact.registration.kind !== "registered" || exact.registration.path !== path) {
    return { status: "conflict", reason: "registration-mismatch" };
  }
  if (!evidence.registrationAbsent || !evidence.markerAbsent || !evidence.branchOccupationAbsent) {
    return { status: "conflict", reason: "absence-unproven" };
  }
  return {
    status: "released",
    claim: { ...exact, registration: { kind: "released", lastPath: path } },
  };
}
