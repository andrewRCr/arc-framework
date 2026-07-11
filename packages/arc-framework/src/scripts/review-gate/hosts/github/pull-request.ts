/**
 * Canonical pull-request facts from the GitHub REST API.
 *
 * Binds a pull request to immutable numeric/node ids and validated 40-hex SHAs,
 * retaining mutable refs only for observation and the host fetch. Repository
 * identity comes from the base repository; a head repository that is absent
 * (deleted fork) or distinct from the base marks the change request
 * cross-repository, so fork coordinates never masquerade as trusted base state.
 * All fields are validated before use — a malformed payload rejects rather than
 * yielding partial facts.
 *
 * @module
 */

import { digestAt, integerAt, objectAt, stringAt } from "../../core/validation.js";
import { normalizeActor, type NormalizedActor } from "./actor.js";
import type { GitHubRestClient, ReadOutcome } from "./api/rest.js";

/** Normalized mergeability derived from the host's async merge computation. */
export type Mergeability = "mergeable" | "conflicting" | "unknown";

/** Canonical, validated facts about one pull request. */
export interface PullRequestFacts {
  /** Immutable base-repository numeric id (retained as a string). */
  repositoryId: string;
  /** Immutable pull-request node id. */
  changeRequestId: string;
  /** Pull-request number, source of the trusted `refs/pull/<n>/head` ref. */
  number: number;
  /** Base branch ref name (mutable; for observation and the trusted fetch). */
  baseRef: string;
  /** Current base tip SHA reported by the host. */
  baseSha: string;
  /** Head branch ref name (mutable). */
  headRef: string;
  /** Head commit SHA. */
  headSha: string;
  /** Immutable head-repository numeric id, or null when the head repository is gone. */
  headRepositoryId: string | null;
  /** True when the head repository is absent or distinct from the base repository. */
  isCrossRepository: boolean;
  /** Draft readiness. */
  isDraft: boolean;
  /** Normalized mergeability. */
  mergeability: Mergeability;
  /** PR author bound to immutable ids, normalized separately for non-author rules. */
  author: NormalizedActor;
}

function boolAt(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
  return value;
}

function numericIdAt(value: unknown, path: string): string {
  return String(integerAt(value, path, 1));
}

function mergeabilityAt(value: unknown, path: string): Mergeability {
  if (value === null || value === undefined) return "unknown";
  return boolAt(value, path) ? "mergeable" : "conflicting";
}

/** Validate a REST pull-request payload into canonical facts. */
export function parsePullRequest(input: unknown): PullRequestFacts {
  const record = objectAt(input, "pullRequest");
  const base = objectAt(record.base, "pullRequest.base");
  const baseRepo = objectAt(base.repo, "pullRequest.base.repo");
  const head = objectAt(record.head, "pullRequest.head");
  const headRepo = head.repo === null || head.repo === undefined
    ? null
    : objectAt(head.repo, "pullRequest.head.repo");

  const repositoryId = numericIdAt(baseRepo.id, "pullRequest.base.repo.id");
  const headRepositoryId = headRepo === null ? null : numericIdAt(headRepo.id, "pullRequest.head.repo.id");

  return {
    repositoryId,
    changeRequestId: stringAt(record.node_id, "pullRequest.node_id"),
    number: integerAt(record.number, "pullRequest.number", 1),
    baseRef: stringAt(base.ref, "pullRequest.base.ref"),
    baseSha: digestAt(base.sha, "pullRequest.base.sha", 40),
    headRef: stringAt(head.ref, "pullRequest.head.ref"),
    headSha: digestAt(head.sha, "pullRequest.head.sha", 40),
    headRepositoryId,
    isCrossRepository: headRepositoryId === null || headRepositoryId !== repositoryId,
    isDraft: boolAt(record.draft, "pullRequest.draft"),
    mergeability: mergeabilityAt(record.mergeable, "pullRequest.mergeable"),
    author: normalizeActor(record.user, "pullRequest.user"),
  };
}

/** Coordinates of a pull request on its trusted base repository. */
export interface PullRequestRef {
  owner: string;
  repo: string;
  number: number;
}

/** Resolve validated pull-request facts through the REST client. */
export function resolvePullRequestFacts(
  rest: GitHubRestClient,
  ref: PullRequestRef,
): Promise<ReadOutcome<PullRequestFacts>> {
  const path = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}`;
  return rest.get(path, { parse: parsePullRequest });
}
