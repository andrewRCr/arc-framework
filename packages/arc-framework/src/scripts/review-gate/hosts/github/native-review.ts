/**
 * Native GitHub review, decision, and conversation normalization.
 *
 * Observes submitted reviews (REST), the aggregate `reviewDecision`, and review
 * threads (GraphQL), binding every actor to immutable ids. It never parses
 * CODEOWNERS or infers Code Owner identity, and a `COMMENTED` review or aggregate
 * host approval is never treated as independent analysis — a current qualified
 * `APPROVED` satisfies peer approval only. Individual approval is atomic to the
 * head it was submitted against, so a head change staleness the approval under
 * the host's own dismissal semantics. Under self-hosting policy every unresolved
 * thread blocks; a resolution closes its finding only when the host exposes a
 * qualifying resolver identity, never on a bare `isResolved` boolean.
 *
 * @module
 */

import type { FindingClosure } from "../../core/evidence.js";
import { digestAt, objectAt, stringAt, timestampAt } from "../../core/validation.js";
import { normalizeActor, type NormalizedActor } from "./actor.js";
import type { GitHubGraphQLClient, GraphQLOutcome, GraphQLPage } from "./api/graphql.js";
import type { GitHubRestClient, ReadOutcome } from "./api/rest.js";
import type { HostCoordinates } from "./change-request.js";

/** Normalized submitted-review state; `commented`/`pending` set no effective state. */
export type ReviewState = "approved" | "changes-requested" | "commented" | "dismissed" | "pending";

/** One submitted review bound to its actor and the head it was submitted against. */
export interface NormalizedReview {
  reviewId: string;
  url: string;
  actor: NormalizedActor;
  state: ReviewState;
  commitId: string;
  submittedAt: string | null;
  /** Durable submitted-review body when the host supplies one. */
  body?: string;
}

/** One immutable inline review comment retained with its containing thread. */
export interface NormalizedReviewComment {
  commentId: string;
  reviewId: string;
  actor: NormalizedActor;
  body: string;
  url: string;
  path: string;
  line: number | null;
  originalLine: number | null;
  commitId: string;
  originalCommitId: string;
}

/** Aggregate host review decision, normalized; null when the host reports none. */
export type ReviewDecision = "approved" | "changes-requested" | "review-required" | null;

/** One review thread with its resolver identity when the host exposes it. */
export interface NormalizedThread {
  threadId: string;
  isResolved: boolean;
  resolvedBy: NormalizedActor | null;
  comments?: NormalizedReviewComment[];
}

// --- Individual reviews (REST) ---

function parseReviewState(state: string, path: string): ReviewState {
  switch (state) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    case "COMMENTED":
      return "commented";
    case "DISMISSED":
      return "dismissed";
    case "PENDING":
      return "pending";
    default:
      throw new Error(`${path}: unexpected review state ${state}`);
  }
}

function parseReview(input: unknown, path: string): NormalizedReview {
  const record = objectAt(input, path);
  const submittedAt = record.submitted_at === null || record.submitted_at === undefined
    ? null
    : timestampAt(record.submitted_at, `${path}.submitted_at`);
  const body = record.body === null || record.body === undefined ? "" : record.body;
  if (typeof body !== "string") throw new Error(`${path}.body: expected a string`);
  return {
    reviewId: stringAt(record.node_id, `${path}.node_id`),
    url: stringAt(record.html_url, `${path}.html_url`),
    actor: normalizeActor(record.user, `${path}.user`),
    state: parseReviewState(stringAt(record.state, `${path}.state`), `${path}.state`),
    commitId: digestAt(record.commit_id, `${path}.commit_id`, 40),
    submittedAt,
    body,
  };
}

/** Read every submitted review for a pull request. */
export function resolveReviews(rest: GitHubRestClient, ref: HostCoordinates): Promise<ReadOutcome<NormalizedReview[]>> {
  const path = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pulls/${ref.number}/reviews`;
  return rest.getPaginated(path, {
    query: { per_page: 100 },
    parsePage: (value) => {
      if (!Array.isArray(value)) throw new Error("reviews: expected an array page");
      return value.map((item, index) => parseReview(item, `reviews[${index}]`));
    },
  });
}

// --- Aggregate decision and review threads (GraphQL) ---

const REVIEW_DECISION_QUERY = `query ReviewDecision($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) { reviewDecision }
  }
}`;

const REVIEW_THREADS_QUERY = `query ReviewThreads($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100, after: $cursor) {
        nodes {
          id
          isResolved
          resolvedBy {
            __typename
            ... on User { id databaseId login }
            ... on Bot { id databaseId login }
            ... on Organization { id databaseId login }
          }
          comments(first: 100) {
            nodes {
              id
              body
              url
              path
              line
              originalLine
              commit { oid }
              originalCommit { oid }
              pullRequestReview { id }
              author {
                __typename
                ... on User { id databaseId login }
                ... on Bot { id databaseId login }
                ... on Organization { id databaseId login }
              }
            }
            pageInfo { hasNextPage }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

function pullRequestNode(data: unknown): Record<string, unknown> {
  const repository = objectAt((objectAt(data, "data")).repository, "data.repository");
  return objectAt(repository.pullRequest, "data.repository.pullRequest");
}

function normalizeGraphqlActor(input: unknown): NormalizedActor | null {
  if (input === null || input === undefined) return null;
  const record = objectAt(input, "resolvedBy");
  if (record.databaseId === null || record.databaseId === undefined) return null;
  return normalizeActor(
    { id: record.databaseId, node_id: record.id, login: record.login, type: record.__typename },
    "resolvedBy",
  );
}

function nullableLine(value: unknown, path: string): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${path}: expected a positive integer or null`);
  return Number(value);
}

function normalizeThreadComments(input: unknown, path: string): NormalizedReviewComment[] | undefined {
  if (input === null || input === undefined) return undefined;
  const connection = objectAt(input, `${path}.comments`);
  if (!Array.isArray(connection.nodes)) throw new Error(`${path}.comments.nodes: expected an array`);
  const pageInfo = objectAt(connection.pageInfo, `${path}.comments.pageInfo`);
  if (pageInfo.hasNextPage !== false) throw new Error(`${path}.comments: incomplete enumeration`);
  return connection.nodes.map((node, index) => {
    const itemPath = `${path}.comments.nodes[${index}]`;
    const record = objectAt(node, itemPath);
    const actor = normalizeGraphqlActor(record.author);
    if (actor === null) throw new Error(`${itemPath}.author: immutable actor id required`);
    return {
      commentId: stringAt(record.id, `${itemPath}.id`),
      reviewId: stringAt(objectAt(record.pullRequestReview, `${itemPath}.pullRequestReview`).id, `${itemPath}.pullRequestReview.id`),
      actor,
      body: stringAt(record.body, `${itemPath}.body`),
      url: stringAt(record.url, `${itemPath}.url`),
      path: stringAt(record.path, `${itemPath}.path`),
      line: nullableLine(record.line, `${itemPath}.line`),
      originalLine: nullableLine(record.originalLine, `${itemPath}.originalLine`),
      commitId: digestAt(objectAt(record.commit, `${itemPath}.commit`).oid, `${itemPath}.commit.oid`, 40),
      originalCommitId: digestAt(
        objectAt(record.originalCommit, `${itemPath}.originalCommit`).oid,
        `${itemPath}.originalCommit.oid`,
        40,
      ),
    };
  });
}

/** Read and normalize the aggregate host review decision. */
export function resolveReviewDecision(gql: GitHubGraphQLClient, ref: HostCoordinates): Promise<GraphQLOutcome<ReviewDecision>> {
  return gql.query({
    query: REVIEW_DECISION_QUERY,
    variables: { owner: ref.owner, repo: ref.repo, number: ref.number },
    parse: (data) => {
      const decision = pullRequestNode(data).reviewDecision;
      switch (decision) {
        case "APPROVED":
          return "approved";
        case "CHANGES_REQUESTED":
          return "changes-requested";
        case "REVIEW_REQUIRED":
          return "review-required";
        case null:
        case undefined:
          return null;
        default:
          throw new Error(`reviewDecision: unexpected ${String(decision)}`);
      }
    },
  });
}

/** Read every review thread with its resolver identity where exposed. */
export function resolveThreads(gql: GitHubGraphQLClient, ref: HostCoordinates): Promise<GraphQLOutcome<NormalizedThread[]>> {
  return gql.paginate({
    query: REVIEW_THREADS_QUERY,
    variables: { owner: ref.owner, repo: ref.repo, number: ref.number },
    extractPage: (data): GraphQLPage<NormalizedThread> => {
      const connection = objectAt(pullRequestNode(data).reviewThreads, "reviewThreads");
      if (!Array.isArray(connection.nodes)) throw new Error("reviewThreads.nodes: expected an array");
      const nodes = connection.nodes;
      const pageInfo = objectAt(connection.pageInfo, "reviewThreads.pageInfo");
      if (typeof pageInfo.hasNextPage !== "boolean") {
        throw new Error("reviewThreads.pageInfo.hasNextPage: expected a boolean");
      }
      if (pageInfo.endCursor !== null && typeof pageInfo.endCursor !== "string") {
        throw new Error("reviewThreads.pageInfo.endCursor: expected a string or null");
      }
      return {
        nodes: nodes.map((node, index): NormalizedThread => {
          const record = objectAt(node, `reviewThreads.nodes[${index}]`);
          if (typeof record.isResolved !== "boolean") {
            throw new Error(`reviewThreads.nodes[${index}].isResolved: expected a boolean`);
          }
          const comments = normalizeThreadComments(record.comments, `reviewThreads.nodes[${index}]`);
          return {
            threadId: stringAt(record.id, `reviewThreads.nodes[${index}].id`),
            isResolved: record.isResolved,
            resolvedBy: normalizeGraphqlActor(record.resolvedBy),
            ...(comments === undefined ? {} : { comments }),
          };
        }),
        hasNextPage: pageInfo.hasNextPage,
        endCursor: pageInfo.endCursor,
      };
    },
  });
}

// --- Reduction ---

/** A current native approval eligible to satisfy a peer-approval requirement only. */
export interface NativePeerApproval {
  actorIdentity: string;
  headSha: string;
}

/** The verdict's native-review block plus derived peer approvals and closures. */
export interface NativeReviewReduction {
  nativeReview: {
    requestedChanges: boolean;
    unresolvedRequiredConversations: number;
    decision: "not-configured" | "review-required" | "changes-requested" | "approved" | "unknown";
  };
  peerApprovals: NativePeerApproval[];
  closures: FindingClosure[];
}

/** Inputs for reducing observed native review state at the current head. */
export interface NativeReviewReductionInput {
  reviews: NormalizedReview[];
  reviewDecision: ReviewDecision;
  threads: NormalizedThread[];
  headSha: string;
  authorIdentity: string;
  /** Whether versioned policy expects a native required-review decision. */
  expectsNativeReview: boolean;
  /** Resolver identities that cannot close a finding (e.g. the review provider's bot). */
  nonClosingResolvers?: readonly string[];
}

/** Latest state-setting review per actor; `commented`/`pending` never set effective state. */
function effectiveReviews(reviews: NormalizedReview[]): NormalizedReview[] {
  const ordered = [...reviews].sort((left, right) => (left.submittedAt ?? "").localeCompare(right.submittedAt ?? ""));
  const byActor = new Map<string, NormalizedReview>();
  for (const review of ordered) {
    if (review.state === "commented" || review.state === "pending") continue;
    byActor.set(review.actor.identity, review);
  }
  return [...byActor.values()];
}

function decisionOf(input: NativeReviewReductionInput): NativeReviewReduction["nativeReview"]["decision"] {
  if (!input.expectsNativeReview) return "not-configured";
  switch (input.reviewDecision) {
    case "review-required":
      return "review-required";
    case "changes-requested":
      return "changes-requested";
    case "approved":
      return "approved";
    case null:
      return "unknown";
  }
}

/** Reduce observed native review state into the verdict block, peer approvals, and closures. */
export function reduceNativeReview(input: NativeReviewReductionInput): NativeReviewReduction {
  const effective = effectiveReviews(input.reviews);
  const peerApprovals = effective
    .filter((review) =>
      review.state === "approved"
      && review.commitId === input.headSha
      && review.actor.identity !== input.authorIdentity)
    .map((review): NativePeerApproval => ({ actorIdentity: review.actor.identity, headSha: input.headSha }));

  const requestedChanges = effective.some((review) =>
    review.state === "changes-requested" && review.commitId === input.headSha)
    || input.reviewDecision === "changes-requested";

  // Native resolution is an observation only. Settlement authority is reduced
  // from source-confirmed closure or a sequenced disposition receipt.
  const closures: FindingClosure[] = [];

  return {
    nativeReview: {
      requestedChanges,
      unresolvedRequiredConversations: input.threads.filter((thread) => !thread.isResolved).length,
      decision: decisionOf(input),
    },
    peerApprovals,
    closures,
  };
}
