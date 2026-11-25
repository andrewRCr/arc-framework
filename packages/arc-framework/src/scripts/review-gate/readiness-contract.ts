/** Shared readiness requests, facts, and command results. */
import { z } from "zod";
import { isAbsolute } from "node:path";
import { CanonicalDigestSchema } from "../../lib/kernel/schema/vocabulary.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

const RepositorySchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u)
  .refine(
    (repository) => repository.split("/").every((segment) => /[^.]/u.test(segment)),
    "repository segments must not consist only of dots",
  );
const PlanIdSchema = z.uuid();
const DeliverableIdSchema = CanonicalDigestSchema;

export const ReviewTargetSchema = z.strictObject({
  repository: RepositorySchema,
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
});

export const LivePullRequestSchema = z.strictObject({
  repository: RepositorySchema,
  number: z.number().int().positive(),
  state: z.enum(["open", "closed"]),
  headBranch: z.string().min(1),
  headSha: GitObjectIdSchema,
});

export const ReviewTreeRootSchema = z.string().min(1).refine(isAbsolute, "treeRoot must be absolute");

export const ReviewVehicleSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("work-unit"),
    slug: SlugSchema,
    archiveCadence: z.enum(["with-integration", "manual"]),
  }),
  z.strictObject({
    kind: z.literal("errand"),
    slug: SlugSchema,
  }),
  z.strictObject({
    kind: z.literal("delivery-member"),
    planId: PlanIdSchema,
    deliverableId: DeliverableIdSchema,
    workUnitSlug: SlugSchema,
  }),
]);

export const ReviewReadinessRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  treeRoot: ReviewTreeRootSchema,
  target: ReviewTargetSchema,
  pullRequest: LivePullRequestSchema,
  vehicle: ReviewVehicleSchema,
}).readonly();
export type ReviewReadinessRequest = z.infer<typeof ReviewReadinessRequestSchema>;
export type ReviewReadinessInput = Omit<z.input<typeof ReviewReadinessRequestSchema>, "vehicle"> & {
  vehicle: z.input<typeof ReviewVehicleSchema> | {
    kind: "delivery-member";
    planId: string;
    deliverableId: string;
    workUnitSlug: string;
  };
};

export const ReviewReadinessFactSchema = z.strictObject({
  code: z.string().min(1),
  path: z.string().min(1),
  message: z.string().min(1),
}).readonly();
export type ReviewReadinessFact = z.infer<typeof ReviewReadinessFactSchema>;

const ReviewReadinessHeaderShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-readiness"),
  diagnostics: z.array(ReviewReadinessFactSchema).readonly(),
};

export const ReviewReadinessEnvelopeSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ReviewReadinessHeaderShape,
    state: z.literal("ready"),
    nextAction: z.literal("none"),
    payload: z.strictObject({
      target: ReviewTargetSchema,
      vehicle: ReviewVehicleSchema,
    }).readonly(),
  }),
  z.strictObject({
    ...ReviewReadinessHeaderShape,
    state: z.literal("invalid"),
    nextAction: z.literal("stop"),
    payload: z.strictObject({
      target: ReviewTargetSchema,
      vehicle: ReviewVehicleSchema,
      facts: z.array(ReviewReadinessFactSchema).min(1).readonly(),
    }).readonly(),
  }),
]);
export type ReviewReadinessEnvelope = z.infer<typeof ReviewReadinessEnvelopeSchema>;

