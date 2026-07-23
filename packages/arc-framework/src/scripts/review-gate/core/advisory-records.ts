/** Durable advisory records shared by local and frontline review lanes. */

import { z } from "zod";

import {
  canonicalDigest,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import {
  FrontlineExecutionOutcomeSchema,
  type FrontlineExecutionOutcome,
} from "../policy/frontline-outcome.js";
import { ApprovedDispositionSetSchema } from "./disposition-records.js";
import { FixAuthorizationSchema } from "./fix-authorization-records.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  ReviewTargetSchema,
} from "./gate-contract-v2-schema.js";

const OpaqueReferenceSchema = z.string().trim().min(1);
const AdvisoryRecordHeaderShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-advisory/v1"),
  repositoryId: ReviewIdentifierSchema,
  operationId: ReviewIdentifierSchema,
};

export const ApprovedDispositionSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("attested-local"),
    receiptRef: OpaqueReferenceSchema,
    localSourceRef: OpaqueReferenceSchema,
  }),
  z.strictObject({
    kind: z.literal("frontline"),
    outcomeRef: OpaqueReferenceSchema,
  }),
]);

export const ApprovedDispositionRecordSchema = z.strictObject({
  ...AdvisoryRecordHeaderShape,
  source: ApprovedDispositionSourceSchema,
  approvedDisposition: ApprovedDispositionSetSchema,
  fixAuthorization: FixAuthorizationSchema.nullable(),
}).superRefine((record, context) => {
  if (record.fixAuthorization !== null
    && record.fixAuthorization.dispositionSetId
      !== record.approvedDisposition.dispositionSet.dispositionSetId) {
    context.addIssue({
      code: "custom",
      message: "fix authorization must bind the approved disposition set",
      path: ["fixAuthorization"],
    });
  }
});
export type ApprovedDispositionRecord = z.infer<typeof ApprovedDispositionRecordSchema>;

export const FrontlineExecutableIdentitySchema = z.strictObject({
  digest: ReviewCanonicalDigestSchema,
  qualifiedVersion: ReviewIdentifierSchema,
});
export type FrontlineExecutableIdentity = z.infer<typeof FrontlineExecutableIdentitySchema>;

export const FrontlineOutcomeDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.frontline.outcome-digest/v1"),
  outcome: FrontlineExecutionOutcomeSchema,
});

const FrontlineOutcomeRecordInputSchema = z.strictObject({
  ...AdvisoryRecordHeaderShape,
  sourceIdentity: ReviewIdentifierSchema,
  executableIdentity: FrontlineExecutableIdentitySchema.nullable(),
  outcome: FrontlineExecutionOutcomeSchema,
});

const FrontlineOutcomeRecordObjectSchema = z.strictObject({
  ...FrontlineOutcomeRecordInputSchema.shape,
  outcomeDigest: ReviewCanonicalDigestSchema,
});

export const FrontlineOutcomeRecordSchema = FrontlineOutcomeRecordObjectSchema.superRefine((record, context) => {
  if (record.sourceIdentity !== record.outcome.source.sourceId) {
    context.addIssue({
      code: "custom",
      message: "source identity must match the normalized outcome source",
      path: ["sourceIdentity"],
    });
  }
  if (record.repositoryId !== record.outcome.target.repositoryId) {
    context.addIssue({
      code: "custom",
      message: "repository identity must match the normalized outcome target",
      path: ["repositoryId"],
    });
  }
  if (record.outcomeDigest !== computeFrontlineOutcomeDigest(record.outcome)) {
    context.addIssue({
      code: "custom",
      message: "outcomeDigest must bind the complete normalized outcome",
      path: ["outcomeDigest"],
    });
  }
  // Staleness can be detected either before executable resolution or by a launched provider.
  if (record.outcome.outcome === "stale-target") return;
  const launched = outcomeRequiredExecutable(record.outcome);
  if (launched !== (record.executableIdentity !== null)) {
    context.addIssue({
      code: "custom",
      message: launched
        ? "launched outcomes require executable identity"
        : "never-launched outcomes cannot carry executable identity",
      path: ["executableIdentity"],
    });
  }
});
export type FrontlineOutcomeRecord = z.infer<typeof FrontlineOutcomeRecordSchema>;

/** Compute the domain-separated digest of the full normalized outcome. */
export function computeFrontlineOutcomeDigest(outcome: FrontlineExecutionOutcome): `sha256:${string}` {
  return canonicalDigest(FrontlineOutcomeDigestPreimageSchema.parse({
    domain: "arc.frontline.outcome-digest/v1",
    outcome,
  }));
}

/** Create one digest-bound frontline outcome record. */
export function createFrontlineOutcomeRecord(
  input: z.input<typeof FrontlineOutcomeRecordInputSchema>,
): FrontlineOutcomeRecord {
  const record = FrontlineOutcomeRecordInputSchema.parse(input);
  return FrontlineOutcomeRecordSchema.parse({
    ...record,
    outcomeDigest: computeFrontlineOutcomeDigest(record.outcome),
  });
}

function outcomeRequiredExecutable(outcome: FrontlineExecutionOutcome): boolean {
  if (outcome.outcome === "pass-cap-exhausted") return false;
  if (outcome.outcome === "unavailable") {
    return outcome.reason.class !== "source-unbound"
      && outcome.reason.class !== "capability-unsupported";
  }
  if (outcome.outcome === "failed") return outcome.reason.class !== "authorization-rejected";
  return true;
}

const ReductionBaseShape = {
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("review-advisory/v1"),
  operationId: ReviewIdentifierSchema,
  persistedVersion: z.number().int().nonnegative(),
  currentTarget: ReviewTargetSchema,
};

export const ReviewReductionProjectionSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("findings"),
    nextAction: z.literal("respond"),
    sourceRefs: z.array(OpaqueReferenceSchema).min(1),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("settled"),
    nextAction: z.literal("none"),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("advisory-complete"),
    nextAction: z.literal("none"),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("retryable"),
    nextAction: z.literal("retry"),
    retryCommand: z.enum(["local-attest", "frontline-run"]),
  }),
  z.strictObject({
    ...ReductionBaseShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("prepare-current-target"),
  }),
]);
export type ReviewReductionProjection = z.infer<typeof ReviewReductionProjectionSchema>;

/** Register the durable advisory record vocabulary. */
export function registerAdvisoryRecordSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(ApprovedDispositionRecordSchema, {
    id: "approved-disposition-record",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(FrontlineOutcomeDigestPreimageSchema, {
    id: "frontline-outcome-digest-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(FrontlineOutcomeRecordSchema, {
    id: "frontline-outcome-record",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ReviewReductionProjectionSchema, {
    id: "review-reduction-projection",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
