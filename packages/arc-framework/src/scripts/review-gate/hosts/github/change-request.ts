/**
 * GitHub change-request composition for the host port.
 *
 * Combines validated pull-request facts and trusted-base coverage into a
 * core-owned `NormalizedChangeRequest`, validated through the core parser so no
 * GitHub object, event payload, or host URL can leak across the port. The pull
 * request's number and owner/repo survive only inside an opaque `hostRef` string
 * the core round-trips without interpreting; immutable numeric/node ids are the
 * only host coordinates the normalized record exposes, and they read as opaque
 * identities. Re-querying unchanged canonical state is deterministic, so the same
 * head yields the same normalized record. Receipt persistence and verdict
 * projection compose separately.
 *
 * @module
 */

import type { GitExec } from "../../../../lib/git/exec.js";
import { parseNormalizedChangeRequest, type NormalizedChangeRequest } from "../../core/contracts.js";
import type { ChangedPath } from "../../policy/self-hosting/lane.js";
import type { NormalizedActor } from "./actor.js";
import type { GitHubRestClient } from "./api/rest.js";
import { resolveCoverageIdentity, type CoverageSensitiveReason } from "./coverage.js";
import { resolvePullRequestFacts, type Mergeability } from "./pull-request.js";

/** Opaque host coordinates for a GitHub pull request. */
export interface HostCoordinates {
  owner: string;
  repo: string;
  number: number;
}

const HOST_REF = /^github:([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/([1-9][0-9]*)$/u;

/** Encode pull-request coordinates into an opaque `hostRef` the core round-trips. */
export function encodeHostRef(coordinates: HostCoordinates): string {
  return `github:${coordinates.owner}/${coordinates.repo}/pull/${coordinates.number}`;
}

/** Decode a `hostRef` back into coordinates, or null when malformed. */
export function decodeHostRef(hostRef: string): HostCoordinates | null {
  const match = HOST_REF.exec(hostRef);
  if (match === null) return null;
  const [, owner, repo, number] = match;
  if (owner === undefined || repo === undefined || number === undefined) return null;
  return { owner, repo, number: Number.parseInt(number, 10) };
}

/** Neutral change context the controller and policy consume beside the port record. */
export interface ChangeContext {
  changedPaths: ChangedPath[];
  author: NormalizedActor;
  isDraft: boolean;
  isCrossRepository: boolean;
  mergeability: Mergeability;
}

/** Dependencies for resolving a GitHub change request. */
export interface GitHubChangeRequestDeps {
  rest: GitHubRestClient;
  exec: GitExec;
  /** Trusted base-repository remote name (never a fork URL). */
  baseRemote: string;
}

/** Outcome of composing a change request from host state. */
export type ChangeRequestResolution =
  | { kind: "resolved"; changeRequest: NormalizedChangeRequest; context: ChangeContext }
  | { kind: "sensitive"; reason: CoverageSensitiveReason }
  | { kind: "unavailable"; reason: string }
  | { kind: "invalid-ref" };

/**
 * Resolve one pull request's normalized change request and neutral context.
 * A PR-lookup failure is `unavailable`; an unresolvable/force-pushed/invalid
 * change set is `sensitive`; both leave no partial core-facing record.
 */
export async function resolveChangeRequest(
  deps: GitHubChangeRequestDeps,
  hostRef: string,
): Promise<ChangeRequestResolution> {
  const coordinates = decodeHostRef(hostRef);
  if (coordinates === null) return { kind: "invalid-ref" };

  const facts = await resolvePullRequestFacts(deps.rest, coordinates);
  switch (facts.kind) {
    case "http-error":
      return { kind: "unavailable", reason: `http-${facts.status}` };
    case "schema-error":
      return { kind: "unavailable", reason: "malformed" };
    case "unavailable":
      return { kind: "unavailable", reason: facts.reason };
    case "ok":
      break;
  }
  const pr = facts.value;

  const coverage = await resolveCoverageIdentity({
    exec: deps.exec,
    baseRemote: deps.baseRemote,
    baseRef: pr.baseRef,
    headSha: pr.headSha,
    prNumber: pr.number,
  });
  if (coverage.kind !== "resolved") return { kind: "sensitive", reason: coverage.reason };

  const changeRequest = parseNormalizedChangeRequest({
    schemaVersion: 1,
    repositoryId: pr.repositoryId,
    changeRequestId: pr.changeRequestId,
    hostRef,
    baseRef: coverage.baseRef,
    baseSha: coverage.baseSha,
    diffBaseSha: coverage.diffBaseSha,
    headSha: coverage.headSha,
    changeSetId: coverage.changeSetId,
  });

  return {
    kind: "resolved",
    changeRequest,
    context: {
      changedPaths: coverage.changedPaths,
      author: pr.author,
      isDraft: pr.isDraft,
      isCrossRepository: pr.isCrossRepository,
      mergeability: pr.mergeability,
    },
  };
}
