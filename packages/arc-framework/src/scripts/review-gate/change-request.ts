/** Exact-head change-request resolution independent of the invoking checkout's ref freshness. */

import { z } from "zod";

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
}

export const ChangeRequestResolveInputSchema = z.object({
  headRef: z.string().trim().min(1),
  headSha: z.string().regex(/^[0-9a-f]{40}$/u),
}).strict();

interface ChangeRequestResultBase {
  schemaVersion: 1;
  mode: "review-change-request-resolve";
  targetRef: { repository: string; headRef: string; headSha: string };
}

export type ChangeRequestResolveResult = ChangeRequestResultBase & (
  | { state: "none"; nextAction: "create-change-request" }
  | { state: "open"; nextAction: "reuse-change-request"; candidate: ChangeRequestCandidate }
  | { state: "merged-at-head"; nextAction: "complete"; candidate: ChangeRequestCandidate }
  | { state: "merged-stale-head"; nextAction: "reconcile-head"; candidate: ChangeRequestCandidate }
  | { state: "closed-unmerged"; nextAction: "reopen-change-request"; candidate: ChangeRequestCandidate }
  | { state: "ambiguous"; nextAction: "stop"; candidates: readonly ChangeRequestCandidate[] }
  | {
      state: "blocked";
      nextAction: "stop";
      reason: "head-mismatch" | "host-failure";
      detail: string;
    }
);

function classifyCandidates(
  targetRef: ChangeRequestResultBase["targetRef"],
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
  return { ...base, state: "ambiguous", nextAction: "stop", candidates };
}

/** Resolve host change-request state for one exact proposed head. */
export async function resolveChangeRequest(
  input: ChangeRequestResolveInput,
  port: ChangeRequestResolutionPort,
): Promise<ChangeRequestResolveResult> {
  const repository = await port.resolveRepository();
  const targetRef = { repository, ...input };
  try {
    const refs = await port.readHeadRef(input.headRef);
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
