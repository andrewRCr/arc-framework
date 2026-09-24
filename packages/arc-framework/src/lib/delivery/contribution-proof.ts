/** Pure identity proof for one delivery member across a predecessor-changing rewrite. */

import { z } from "zod";

const ObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

export const DeliveryContributionCoordinateSchema = z.strictObject({
  head: ObjectIdSchema,
  tree: ObjectIdSchema,
});
export type DeliveryContributionCoordinate = z.infer<typeof DeliveryContributionCoordinateSchema>;

export const DeliveryContributionEndpointsSchema = z.strictObject({
  before: z.strictObject({
    predecessor: DeliveryContributionCoordinateSchema,
    member: DeliveryContributionCoordinateSchema,
  }),
  after: z.strictObject({
    predecessor: DeliveryContributionCoordinateSchema,
    member: DeliveryContributionCoordinateSchema,
  }),
});
export type DeliveryContributionEndpoints = z.infer<typeof DeliveryContributionEndpointsSchema>;

/**
 * Copy richer delivery records into the exact coordinate shape accepted by contribution proof.
 *
 * @param input - Before and after coordinates that may carry delivery-only fields at runtime
 * @returns Fresh endpoints containing only the proof boundary's head and tree fields
 */
export function projectDeliveryContributionEndpoints(
  input: DeliveryContributionEndpoints,
): DeliveryContributionEndpoints {
  const coordinate = ({ head, tree }: DeliveryContributionCoordinate): DeliveryContributionCoordinate => ({
    head,
    tree,
  });
  return {
    before: {
      predecessor: coordinate(input.before.predecessor),
      member: coordinate(input.before.member),
    },
    after: {
      predecessor: coordinate(input.after.predecessor),
      member: coordinate(input.after.member),
    },
  };
}

export const DeliveryContributionProofResultSchema = z.union([
  z.strictObject({
    status: z.literal("accepted"),
    proof: z.enum(["tree-equality", "mechanical-reapply"]),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.literal("contribution-conflicted"),
    paths: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.literal("contribution-diverged"),
    paths: z.array(z.string()),
  }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.enum([
      "contribution-endpoints-unverified",
      "git-failure",
      "merge-tree-write-tree-unsupported",
    ]),
  }),
]);
export type DeliveryContributionProofResult = z.infer<typeof DeliveryContributionProofResultSchema>;

/** One typed refusal from delivery contribution proof. */
export type DeliveryContributionRefusal = Extract<
  DeliveryContributionProofResult,
  { readonly status: "refused" }
>;

/** Pure decision at the boundary between the tree fast path and Git-backed reapplication. */
export type DeliveryContributionComparison =
  | Extract<DeliveryContributionProofResult, { readonly status: "accepted" }>
  | { readonly status: "reapply-required" };

/** Compare one pinned before/after contribution, preferring complete member-tree equality. */
export function compareDeliveryContribution(
  input: DeliveryContributionEndpoints,
): DeliveryContributionComparison {
  const endpoints = DeliveryContributionEndpointsSchema.parse(input);
  if (endpoints.before.predecessor.head === endpoints.after.predecessor.head
    && endpoints.before.member.tree === endpoints.after.member.tree) {
    return { status: "accepted", proof: "tree-equality" };
  }
  return { status: "reapply-required" };
}
