/** The host's own review verdict for one open change request, read beside ARC's review status. */

import { z } from "zod";

import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

/** One standing review that holds the host's merge gate. */
export const HostBlockingReviewSchema = z.strictObject({
  reviewId: z.number().int().positive(),
  author: z.string().trim().min(1),
  commitSha: GitObjectIdSchema.nullable(),
  submittedAt: z.string().trim().min(1),
});
export type HostBlockingReview = z.infer<typeof HostBlockingReviewSchema>;

/**
 * What the host's review rule says about merging the change request now.
 *
 * `changes-requested` names the reviews holding the host's gate; it is a separate blocker from ARC's routed
 * review obligation, and clearing one never clears the other.
 */
export const HostReviewStatusSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("clear") }),
  z.strictObject({ state: z.literal("approval-required") }),
  z.strictObject({
    state: z.literal("changes-requested"),
    blockingReviews: z.array(HostBlockingReviewSchema),
  }),
  z.strictObject({ state: z.literal("unavailable"), detail: z.string().trim().min(1) }),
]);
export type HostReviewStatus = z.infer<typeof HostReviewStatusSchema>;

export interface HostReviewPort {
  read(repository: string, pullRequest: number, signal: AbortSignal): Promise<HostReviewStatus>;
}

/**
 * Read the host's review verdict, reporting a failed read as unavailable rather than failing the caller.
 *
 * @param port - The host adapter.
 * @param repository - The `owner/name` of the change request.
 * @param pullRequest - The change request's number.
 * @param signal - Cancels the host read.
 * @returns The host's verdict, or `unavailable` carrying the failure.
 */
export async function readHostReview(
  port: HostReviewPort,
  repository: string,
  pullRequest: number,
  signal: AbortSignal,
): Promise<HostReviewStatus> {
  try {
    return HostReviewStatusSchema.parse(await port.read(repository, pullRequest, signal));
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim() : String(error).trim();
    return {
      state: "unavailable",
      detail: detail.length > 0 ? detail : "The host's review state could not be read.",
    };
  }
}
