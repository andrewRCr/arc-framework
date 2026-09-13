/** Positive Errand identity and exact-head lane progress for review status. */

import { readTransientIdentitySnapshot } from "../../lib/errand/identity-snapshot.js";
import { resolveChangeRequestLifecycleConfiguration } from "../../lib/errand/change-request-lifecycle.js";
import type { TransientIdentityRecord } from "../../lib/errand/identity-record.js";
import { isErrandBranchType } from "../../lib/errand/branch-type.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import type { GitExec } from "../../lib/git/exec.js";
import { resolveIdentity } from "../../lib/git/index.js";
import { LocalReviewOperationStateStore } from "./hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "./hosts/local/git-common-state.js";
import { readLaneProgress } from "./lane-progress.js";
import type { ChangeRequestCandidate } from "./change-request.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "./policy/standard-review.js";
import type { RoutedReviewObligation } from "./status.js";

interface ExactErrandStatusTarget {
  readonly repository: string;
  readonly headRef: string;
  readonly headSha: string;
}

function blocked(detail: string): RoutedReviewObligation {
  return { state: "blocked", detail };
}

async function branchAtHead(
  exec: GitExec,
  branch: string,
  remote: string,
  headSha: string,
): Promise<boolean> {
  for (const ref of [`refs/remotes/${remote}/${branch}`, `refs/heads/${branch}`]) {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
      if (stdout.trim() === headSha) return true;
    } catch {
      // Either ref may be absent; an exact local branch may outpace remote tracking.
    }
  }
  const remoteRef = `refs/heads/${branch}`;
  const { stdout } = await exec("git", ["ls-remote", "--heads", remote, remoteRef]);
  return stdout.trim() === `${headSha}\t${remoteRef}`;
}

function matchingOrdinaryErrand(
  records: readonly TransientIdentityRecord[],
  target: ExactErrandStatusTarget,
): { readonly kind: "none" } | { readonly kind: "blocked"; readonly detail: string } | {
  readonly kind: "matched";
  readonly record: Extract<TransientIdentityRecord, { kind: "errand"; purpose: "errand" }>;
} {
  const matching = records.filter((record) => record.branch === target.headRef);
  if (matching.length === 0) return { kind: "none" };
  if (matching.length !== 1) {
    return { kind: "blocked", detail: "The target branch has ambiguous transient identity claims." };
  }
  const record = matching[0];
  if (record?.kind !== "errand" || record.purpose !== "errand"
    || (record.state !== "open" && record.state !== "awaiting-merge")) {
    return { kind: "blocked", detail: "The target branch does not carry an active ordinary Errand identity." };
  }
  if (record.state === "awaiting-merge" && (
    record.changeRequest.repositoryRef.toLowerCase() !== target.repository.toLowerCase()
    || record.changeRequest.headRef !== target.headRef
    || record.changeRequest.headSha !== target.headSha
  )) {
    return { kind: "blocked", detail: "The Errand identity's change request does not match the exact target." };
  }
  return { kind: "matched", record };
}

/**
 * Read an Errand's standard-review disposition only after a strict identity matches the target branch.
 *
 * @param input - Exact host target, checkout, and Git boundary already selected by review status.
 * @returns An Errand obligation, or null when no transient identity claims the branch.
 */
export async function readErrandRoutedObligation(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly target: ExactErrandStatusTarget;
  readonly pullRequest: number;
  readonly remote?: string;
  readonly changeRequestCandidate?: Pick<ChangeRequestCandidate, "baseRefName" | "url">;
}): Promise<RoutedReviewObligation | null> {
  // The branch vocabulary only avoids an impossible identity read; the record still grants authority.
  if (!isErrandBranchType(input.target.headRef.split("/", 1)[0] ?? "")) return null;
  const exec: GitExec = (command, args, options) => input.exec(command, args, { ...options, cwd: input.cwd });
  try {
    const identity = await resolveIdentity({ exec });
    if (identity === null) return null;
    const snapshot = await readTransientIdentitySnapshot({ exec, identity });
    if (snapshot.kind === "absent") return null;
    if (snapshot.kind === "error" || snapshot.diagnostics.length > 0) {
      return blocked("The transient identity needed to select the review vehicle is unreadable.");
    }
    const selected = matchingOrdinaryErrand([...snapshot.records.values()], input.target);
    if (selected.kind === "none") return null;
    if (selected.kind === "blocked") return blocked(selected.detail);
    if (selected.record.state === "awaiting-merge") {
      const candidate = input.changeRequestCandidate;
      const configured = candidate === undefined ? null : await resolveChangeRequestLifecycleConfiguration(
        exec,
        candidate.baseRefName,
        input.remote ?? "origin",
      );
      const retained = selected.record.changeRequest;
      if (candidate === undefined || configured === null
        || retained.baseRef !== candidate.baseRefName
        || retained.hostRef.toLowerCase() !== configured.hostRef.toLowerCase()
        || retained.hostRef.toLowerCase() !== new URL(candidate.url).hostname.toLowerCase()
        || retained.repositoryRef.toLowerCase() !== configured.repositoryRef.toLowerCase()) {
        return blocked("The Errand identity's change request does not match the exact target.");
      }
    }
    if (!await branchAtHead(exec, input.target.headRef, input.remote ?? "origin", input.target.headSha)) {
      return blocked("The Errand identity's branch does not match the exact review head.");
    }

    const publisher = new RepositoryGitCommonStatePublisher(exec, input.cwd);
    const repositoryId = await resolveRepositoryIdentity(publisher);
    const progress = await readLaneProgress(new LocalReviewOperationStateStore(publisher), {
      lane: "standard",
      repositoryId,
      headSha: input.target.headSha,
    });
    if (progress.status === "unrecorded") {
      return { state: "review-required", detail: "No standard review is recorded for this Errand head." };
    }
    let latest: { readonly outcome: string; readonly complete: boolean } | null = null;
    let currentClaimAttempt = false;
    let obsoleteClaimDetail: string | null = null;
    const rubric = STANDARD_REVIEW_RUBRIC_IDENTITY;
    for (const attempt of progress.attempts) {
      const hosted = attempt.hosted;
      if (hosted?.handle !== undefined) {
        const handle = hosted.handle;
        const vehicle = handle.vehicle;
        if (vehicle?.kind !== "errand"
          || vehicle.key !== selected.record.slug
          || vehicle.branch !== selected.record.branch) {
          return blocked("Recorded review progress does not match the exact Errand identity and change request.");
        }
        if (vehicle.claimId !== selected.record.claimId) {
          obsoleteClaimDetail = "Recorded review progress does not match the exact Errand identity and change request.";
          continue;
        }
        if (handle.target.repository.toLowerCase() !== input.target.repository.toLowerCase()
          || handle.target.pullRequest !== input.pullRequest
          || handle.target.headSha !== input.target.headSha) {
          return blocked("Recorded review progress does not match the exact Errand identity and change request.");
        }
        currentClaimAttempt = true;
        latest = {
          outcome: attempt.outcome,
          complete: hosted.effectiveCoverage === "complete"
            && vehicle.standardReview.rubricVersion === rubric.version
            && vehicle.standardReview.rubricDigest === rubric.digest
            && hosted.requirement.rubricVersion === rubric.version
            && hosted.requirement.rubricDigest === rubric.digest,
        };
      } else if (hosted !== undefined) {
        if (attempt.outcome === "clean" || attempt.outcome === "findings"
          || attempt.outcome === "settled-findings") {
          return blocked("Recorded hosted review has no exact Errand request binding.");
        }
        latest = { outcome: attempt.outcome, complete: false };
      } else if (attempt.local !== undefined) {
        if (attempt.local.vehicle.kind !== "errand"
          || attempt.local.vehicle.identity !== selected.record.slug
          || attempt.local.target.headSha !== input.target.headSha) {
          return blocked("Recorded local review does not match the exact Errand target.");
        }
        if (attempt.local.vehicle.claimId !== selected.record.claimId) {
          obsoleteClaimDetail = "Recorded local review does not match the exact Errand target.";
          continue;
        }
        currentClaimAttempt = true;
        latest = {
          outcome: attempt.outcome,
          complete: attempt.chunkSeriesComplete !== false
            && attempt.local.rubricIdentity?.version === rubric.version
            && attempt.local.rubricIdentity.digest === rubric.digest,
        };
      } else {
        latest = { outcome: attempt.outcome, complete: false };
      }
    }
    if (!currentClaimAttempt && obsoleteClaimDetail !== null) return blocked(obsoleteClaimDetail);
    const settled = latest !== null && latest.complete && progress.completedPasses > 0
      && (latest.outcome === "clean" || latest.outcome === "settled-findings");
    return settled
      ? { state: "settled", detail: "The exact Errand standard-review lane is settled." }
      : { state: "review-required", detail: "The exact Errand standard-review lane is not settled." };
  } catch (error) {
    return blocked(error instanceof Error ? error.message : String(error));
  }
}
