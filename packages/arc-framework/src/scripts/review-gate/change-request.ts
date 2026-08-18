/** Exact-head change-request resolution independent of the invoking checkout's ref freshness. */

import { z } from "zod";

import { spineRemedy, type SpineRemedy } from "../integration/spine-refusal.js";

export const ChangeRequestCandidateSchema = z.object({
  number: z.number().int().positive(),
  url: z.url(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  baseRefName: z.string().min(1),
  headRefName: z.string().min(1),
  headRefOid: z.string().regex(/^[0-9a-f]{40}$/u),
}).strict();

export type ChangeRequestCandidate = z.infer<typeof ChangeRequestCandidateSchema>;

export interface ChangeRequestResolutionPort {
  resolveRepository(): Promise<string>;
  readHeadRef(headRef: string): Promise<{ local: string | null; remote: string | null }>;
  listByHead(repository: string, headRef: string): Promise<readonly ChangeRequestCandidate[]>;
  searchByHeadSha(repository: string, headSha: string): Promise<readonly ChangeRequestCandidate[]>;
}

export interface ChangeRequestResolveInput {
  headRef: string;
  headSha: string;
  requireRemote?: boolean;
}

export const ChangeRequestResolveInputSchema = z.object({
  headRef: z.string().trim().min(1),
  headSha: z.string().regex(/^[0-9a-f]{40}$/u),
  requireRemote: z.boolean().optional(),
}).strict();

export const ChangeRequestTargetRefSchema = z.strictObject({
  repository: z.string().trim().min(1),
  headRef: z.string().trim().min(1),
  headSha: z.string().regex(/^[0-9a-f]{40}$/u),
});
export type ChangeRequestTargetRef = z.infer<typeof ChangeRequestTargetRefSchema>;

interface ChangeRequestResultBase {
  schemaVersion: 1;
  mode: "review-change-request-resolve";
}

export type ChangeRequestResolveResult = ChangeRequestResultBase & (
  | { targetRef: ChangeRequestTargetRef; state: "none"; nextAction: "create-change-request" }
  | { targetRef: ChangeRequestTargetRef; state: "open"; nextAction: "reuse-change-request"; candidate: ChangeRequestCandidate }
  | { targetRef: ChangeRequestTargetRef; state: "merged-at-head"; nextAction: "complete"; candidate: ChangeRequestCandidate }
  | { targetRef: ChangeRequestTargetRef; state: "merged-stale-head"; nextAction: "reconcile-head"; candidate: ChangeRequestCandidate }
  | { targetRef: ChangeRequestTargetRef; state: "closed-unmerged"; nextAction: "reopen-change-request"; candidate: ChangeRequestCandidate }
  | {
      targetRef: ChangeRequestTargetRef;
      state: "ambiguous";
      nextAction: "stop";
      candidates: readonly ChangeRequestCandidate[];
      remedy?: SpineRemedy;
    }
  | {
      targetRef: ChangeRequestTargetRef | null;
      state: "blocked";
      nextAction: "stop";
      reason: "head-mismatch" | "host-failure";
      detail: string;
    }
);

function classifyCandidates(
  targetRef: ChangeRequestTargetRef,
  candidates: readonly ChangeRequestCandidate[],
): ChangeRequestResolveResult {
  const base = { schemaVersion: 1, mode: "review-change-request-resolve", targetRef } as const;
  if (candidates.length === 0) return { ...base, state: "none", nextAction: "create-change-request" };
  if (candidates.length !== 1) return { ...base, state: "ambiguous", nextAction: "stop", candidates };
  const candidate = candidates[0];
  if (candidate === undefined) return { ...base, state: "ambiguous", nextAction: "stop", candidates };
  if (candidate.state === "OPEN" && candidate.headRefOid === targetRef.headSha) {
    return { ...base, state: "open", nextAction: "reuse-change-request", candidate };
  }
  if (candidate.state === "MERGED" && candidate.headRefOid === targetRef.headSha) {
    return { ...base, state: "merged-at-head", nextAction: "complete", candidate };
  }
  if (candidate.state === "MERGED") {
    return { ...base, state: "merged-stale-head", nextAction: "reconcile-head", candidate };
  }
  if (candidate.state === "CLOSED" && candidate.headRefOid === targetRef.headSha) {
    return { ...base, state: "closed-unmerged", nextAction: "reopen-change-request", candidate };
  }
  if (candidate.state === "OPEN" && candidate.headRefOid !== targetRef.headSha) {
    return {
      ...base,
      state: "ambiguous",
      nextAction: "stop",
      candidates,
      remedy: spineRemedy(
        "An open change request exists at a different head.",
        "Push the target branch, then re-run exact-head resolution",
        [
          "arc",
          "review",
          "change-request",
          "resolve",
          "--head-ref",
          targetRef.headRef,
          "--head-sha",
          targetRef.headSha,
          "--json",
        ],
      ),
    };
  }
  return { ...base, state: "ambiguous", nextAction: "stop", candidates };
}

/** Resolve host change-request state for one exact proposed head. */
export async function resolveChangeRequest(
  input: ChangeRequestResolveInput,
  port: ChangeRequestResolutionPort,
): Promise<ChangeRequestResolveResult> {
  let targetRef: ChangeRequestTargetRef | null = null;
  try {
    const repository = await port.resolveRepository();
    targetRef = ChangeRequestTargetRefSchema.parse({
      repository,
      headRef: input.headRef,
      headSha: input.headSha,
    });
    const refs = await port.readHeadRef(input.headRef);
    if (input.requireRemote === true && refs.remote !== input.headSha) {
      return {
        schemaVersion: 1,
        mode: "review-change-request-resolve",
        targetRef,
        state: "blocked",
        nextAction: "stop",
        reason: "head-mismatch",
        detail: "The remote branch ref does not match the exact head required for change-request creation.",
      };
    }
    const visibleRefs = [refs.local, refs.remote].filter((oid): oid is string => oid !== null);
    if (refs.remote !== null && !visibleRefs.includes(input.headSha)) {
      return {
        schemaVersion: 1,
        mode: "review-change-request-resolve",
        targetRef,
        state: "blocked",
        nextAction: "stop",
        reason: "head-mismatch",
        detail: "The supplied head matches neither the local nor remote branch ref.",
      };
    }
    const byRef = await port.listByHead(repository, input.headRef);
    if (byRef.length !== 0) return classifyCandidates(targetRef, byRef);
    return classifyCandidates(targetRef, await port.searchByHeadSha(repository, input.headSha));
  } catch (error) {
    return {
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef,
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
