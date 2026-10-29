/** Dismiss a review service's change-request review once every thread it commented in is resolved. */

import { z } from "zod";

import { HostBlockingReviewSchema } from "../host-review.js";
import type { HostedGitHubThread } from "./github.js";
import { HostedTargetSchema, type HostedTarget } from "./request.js";

/** The dismissal message, written in the account owner's voice and composed here rather than by the caller. */
export const HOSTED_DISMISSAL_MESSAGE = "All of the reviewer's threads on this pull request are resolved.";

/** One blocking review exactly as `arc review status` reports it under `hostReview`, at the open request's head. */
export const HostedDismissEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: HostedTargetSchema,
  review: HostBlockingReviewSchema,
});
export type HostedDismissEnvelope = z.infer<typeof HostedDismissEnvelopeSchema>;

/** The host's current record of one review. */
export interface HostedDismissalReview {
  state: "approved" | "changes-requested" | "commented" | "dismissed" | "pending";
  actorIdentity: string;
  commitSha: string | null;
}

/**
 * The host's answer to one dismissal write: confirmed, refused outright with the host's reason, or uncertain until
 * the review is read back.
 */
export type HostedReviewDismissalWrite =
  | { kind: "dismissed" }
  | { kind: "refused"; reason: string }
  | { kind: "ambiguous" };

export interface HostedReviewDismissalPort {
  readHead(target: HostedTarget): Promise<string>;
  /** Returns null when the host has no review with this ID on the request. */
  readReview(target: HostedTarget, reviewId: number): Promise<HostedDismissalReview | null>;
  readThreads(target: HostedTarget): Promise<HostedGitHubThread[]>;
  dismissReview(target: HostedTarget, reviewId: number, message: string): Promise<HostedReviewDismissalWrite>;
}

const HostedDismissResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-dismiss"),
  target: HostedTargetSchema,
  reviewId: HostBlockingReviewSchema.shape.reviewId,
};

const HostedDismissStopStateSchema = z.enum([
  "missing-review",
  "not-change-request",
  "review-mismatch",
  "not-review-service",
  "host-refused",
  "ambiguous",
]);

export const HostedDismissResultSchema = z.union([
  z.strictObject({
    ...HostedDismissResultBaseShape,
    state: z.enum(["dismissed", "already-dismissed"]),
    nextAction: z.literal("complete"),
  }),
  z.strictObject({
    ...HostedDismissResultBaseShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("stop"),
    observedHeadSha: z.string().min(1),
    detail: z.string().min(1),
  }),
  z.strictObject({
    ...HostedDismissResultBaseShape,
    state: z.literal("unresolved-threads"),
    nextAction: z.literal("stop"),
    threadIds: z.array(z.string().min(1)).min(1),
    detail: z.string().min(1),
  }),
  z.strictObject({
    ...HostedDismissResultBaseShape,
    state: HostedDismissStopStateSchema,
    nextAction: z.literal("stop"),
    detail: z.string().min(1),
  }),
]);
export type HostedDismissResult = z.infer<typeof HostedDismissResultSchema>;

/**
 * Dismiss one review service's change-request review, refusing unless the request is still at the reviewed head and
 * every thread that service commented in on the request is resolved.
 *
 * A person's review is never dismissed: only a review whose author is one of `serviceIdentities` qualifies. A review
 * the host already reports dismissed completes without another mutation, so a retry after an uncertain write is safe.
 *
 * @param request - The validated request naming the target head and the blocking review.
 * @param port - The host adapter.
 * @param serviceIdentities - Host account IDs of the registered hosted review services.
 * @returns The dismissal outcome, or the typed refusal that stopped it before any host mutation.
 */
export async function dismissHostedReview(
  request: HostedDismissEnvelope,
  port: HostedReviewDismissalPort,
  serviceIdentities: readonly string[],
): Promise<HostedDismissResult> {
  const base = {
    schemaVersion: 1,
    mode: "review-hosted-dismiss",
    target: request.target,
    reviewId: request.review.reviewId,
  } as const;
  const stop = (state: z.infer<typeof HostedDismissStopStateSchema>, detail: string): HostedDismissResult =>
    ({ ...base, state, nextAction: "stop", detail });

  const observedHeadSha = await port.readHead(request.target);
  if (observedHeadSha !== request.target.headSha) {
    return {
      ...base,
      state: "stale-target",
      nextAction: "stop",
      observedHeadSha,
      detail: "The pull request's head moved; read `arc review status` at the new head before dismissing.",
    };
  }
  const review = await port.readReview(request.target, request.review.reviewId);
  if (review === null) return stop("missing-review", "The host has no review with this ID on the pull request.");
  if (review.state === "dismissed") return { ...base, state: "already-dismissed", nextAction: "complete" };
  if (review.state !== "changes-requested") {
    return stop("not-change-request", `The review's state is ${review.state}, not a change request.`);
  }
  if (review.commitSha !== request.review.commitSha) {
    return stop("review-mismatch", "The host's review names a different reviewed commit than the request.");
  }
  if (!serviceIdentities.includes(review.actorIdentity)) {
    return stop("not-review-service", "The review's author is not a registered review service; a person's "
      + "review is never dismissed here.");
  }
  const unresolved = (await port.readThreads(request.target))
    .filter((thread) => !thread.isResolved
      && thread.comments.some((comment) => comment.actorIdentity === review.actorIdentity))
    .map((thread) => thread.id);
  if (unresolved.length > 0) {
    return {
      ...base,
      state: "unresolved-threads",
      nextAction: "stop",
      threadIds: unresolved,
      detail: "Settle each of the review service's unresolved threads before dismissing its review.",
    };
  }
  const written = await port.dismissReview(request.target, request.review.reviewId, HOSTED_DISMISSAL_MESSAGE);
  if (written.kind === "dismissed") return { ...base, state: "dismissed", nextAction: "complete" };
  if (written.kind === "refused") return stop("host-refused", `The host refused the dismissal: ${written.reason}`);
  const reread = await port.readReview(request.target, request.review.reviewId);
  return reread?.state === "dismissed"
    ? { ...base, state: "dismissed", nextAction: "complete" }
    : stop("ambiguous", "The host did not confirm the dismissal; read the review on the host before retrying.");
}
