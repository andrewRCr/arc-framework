/** GitHub's review decision for one pull request, with the writer reviews that hold it. */

import type { HostedProcessRunner } from "../../hosted/gh-process.js";
import {
  HostReviewStatusSchema,
  type HostBlockingReview,
  type HostReviewPort,
  type HostReviewStatus,
} from "../../host-review.js";
import { GitObjectIdSchema } from "../../core/gate-contract-v2-schema.js";

// `reviewDecision` is the verdict GitHub's own review rule computes; it is null when no review rule applies.
// `latestOpinionatedReviews` keeps each writer's latest approving or change-requesting review, so a dismissed or
// superseded review never appears. Review IDs exceed 32 bits, so they come from `fullDatabaseId`, a decimal string.
const QUERY = "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){"
  + "pullRequest(number:$number){reviewDecision "
  + "latestOpinionatedReviews(first:100,writersOnly:true){nodes{"
  + "fullDatabaseId state submittedAt author{login} commit{oid}}}}}}";

function parse(text: string, path: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${path}: malformed JSON`);
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

function reviewId(value: unknown, path: string): number {
  const id = typeof value === "string" && /^[1-9][0-9]*$/u.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(id)) throw new Error(`${path}: expected a positive integer review ID`);
  return id;
}

function blockingReviews(value: unknown): HostBlockingReview[] {
  const nodes = record(value, "host-review.latestOpinionatedReviews").nodes;
  if (!Array.isArray(nodes)) throw new Error("host-review.latestOpinionatedReviews.nodes: expected an array");
  return nodes.flatMap((node: unknown, index) => {
    const review = record(node, `host-review.reviews[${index}]`);
    if (review.state !== "CHANGES_REQUESTED") return [];
    const commit = review.commit === null ? null : record(review.commit, `host-review.reviews[${index}].commit`);
    const commitSha = commit === null ? null : commit.oid;
    if (commitSha !== null && !GitObjectIdSchema.safeParse(commitSha).success) {
      throw new Error(`host-review.reviews[${index}].commit.oid: expected a Git object ID`);
    }
    const author = review.author === null ? null : record(review.author, `host-review.reviews[${index}].author`);
    return [{
      reviewId: reviewId(review.fullDatabaseId, `host-review.reviews[${index}].fullDatabaseId`),
      // GitHub reports a deleted account's reviews with no author and shows them as `ghost`.
      author: author === null ? "ghost" : author.login as string,
      commitSha: commitSha as string | null,
      submittedAt: review.submittedAt as string,
    }];
  });
}

function hostReviewStatus(value: unknown): HostReviewStatus {
  const data = record(record(value, "host-review").data, "host-review.data");
  const repository = record(data.repository, "host-review.data.repository");
  const pull = record(repository.pullRequest, "host-review.data.repository.pullRequest");
  switch (pull.reviewDecision) {
    case "CHANGES_REQUESTED":
      return { state: "changes-requested", blockingReviews: blockingReviews(pull.latestOpinionatedReviews) };
    case "REVIEW_REQUIRED":
      return { state: "approval-required" };
    case "APPROVED":
    case null:
      return { state: "clear" };
    default:
      throw new Error("host-review.reviewDecision: unrecognized review decision");
  }
}

/**
 * Create the GitHub adapter for the host's review verdict.
 *
 * @param runner - Runs `gh`.
 * @returns A port reading one pull request's review decision and its blocking writer reviews.
 */
export function createGhHostReviewPort(runner: HostedProcessRunner): HostReviewPort {
  return {
    read: async (repository, pullRequest, signal) => {
      const [owner, name] = repository.split("/");
      const output = await runner.run([
        "api", "graphql",
        "--raw-field", `query=${QUERY}`,
        "-F", `owner=${owner ?? ""}`,
        "-F", `name=${name ?? ""}`,
        "-F", `number=${pullRequest}`,
      ], { signal });
      return HostReviewStatusSchema.parse(hostReviewStatus(parse(output.stdout, "host-review")));
    },
  };
}
