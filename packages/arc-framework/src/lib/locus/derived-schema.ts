/** Complete runtime contracts for checkout-derived session frames. */

import { UnclosedTaskCommitsSchema } from "./unclosed-task-commits-schema.js";
import { StoreIdentityDiscoverySchema } from "./store-identities.js";
import { ParsedMetaPauseSchema } from "../active/meta-schema.js";
import { SessionActionsSchema } from "../session-init/actions.js";
import { z } from "zod";
import { RegisteredWorktreeSchema } from "../git/worktree-roster.js";
import { LoadSetManifestSchema, LoadSetPathSchema } from "../load-set/types.js";
import { TaskListCursorFileResultSchema } from "../task-list/file-cursor.js";
import { IntegrationBoundaryLocusSchema } from "../../scripts/review-gate/policy/integration-boundary-locus.js";
import { LocusIdentityV1Schema } from "./schema/identity.js";

const text = z.string().min(1);
const workUnit = z.strictObject({ kind: z.literal("work-unit"), key: text });
const subject = z.discriminatedUnion("kind", [
  workUnit,
  z.strictObject({ kind: z.literal("partial-errand"), key: text, claimId: z.null() }),
  z.strictObject({ kind: z.enum(["errand", "groom", "housekeep"]), key: text, claimId: text }),
]);
/** Diagnostic facts retained on their exact checkout row. */
export const DerivedCheckoutDiagnosticSchema = z.strictObject({
  code: text, source: z.string().optional(), message: z.string(),
});
const diagnostics = z.array(DerivedCheckoutDiagnosticSchema).readonly();
const context = z.strictObject({
  kind: z.literal("resolved"), metaPath: LoadSetPathSchema,
  pause: ParsedMetaPauseSchema.nullable().optional(),
  unclosedTaskCommits: UnclosedTaskCommitsSchema.optional(),
  owner: z.string().nullable(), branch: z.string().nullable(),
  sessionType: z.enum(["planning", "execution", "prepublication", "integration"]).nullable(),
  workflow: z.string().nullable(), stage: z.enum(["draft-design", "create-spec", "generate-tasks"]).nullable(),
  taskListPath: LoadSetPathSchema.nullable(), taskCursor: TaskListCursorFileResultSchema.nullable(),
  workUnitStage: z.enum(["task-work", "verification-closeout", "delivery-correction"]).nullable().optional(),
  cohortDocPath: LoadSetPathSchema.nullable(), loadSet: LoadSetManifestSchema,
  integrationBoundary: IntegrationBoundaryLocusSchema.nullable(),
});
const row = {
  checkout: RegisteredWorktreeSchema, markerGeneration: z.string().nullable(),
  parentCheckoutPath: z.string().nullable(),
  origin: z.union([z.strictObject({ entry: z.string(), sourceDigest: z.string() }),
    z.strictObject({ entry: z.string(), version: z.string() })]).nullable(),
  identity: LocusIdentityV1Schema.nullable(), context: context.nullable(),
  actions: SessionActionsSchema.optional(),
  lifecycleLocation: z.enum(["active", "completed", "parked"]).nullable(), diagnostics,
};
/** Full row taxonomy, including unresolved and terminal registrations. */
export const DerivedCheckoutRowSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...row, kind: z.enum(["free-primary", "unmanaged-checkout"]), subject: z.null() }),
  z.strictObject({ ...row, kind: z.enum(["work-unit", "retired", "transient"]), subject }),
  z.strictObject({ ...row, kind: z.literal("unresolved-checkout"), subject: subject.nullable() }),
]);
const identityDiagnostic = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("malformed"), key: z.string(), message: z.string() }),
  z.strictObject({ kind: z.literal("oversized"), key: z.string(), declaredBytes: z.number() }),
  z.strictObject({ kind: z.literal("unreadable"), key: z.string(), message: z.string(), error: z.unknown().optional() }),
  z.strictObject({ kind: z.literal("unknown-version"), key: z.string(), version: z.unknown() }),
  z.strictObject({ kind: z.literal("key-mismatch"), key: z.string(), slug: z.string() }),
]);
/** One complete read of roster, entering role, allocation, and active context. */
export const DerivedLocusFrameSchema = z.strictObject({
  roster: z.array(DerivedCheckoutRowSchema).readonly(),
  entering: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("selected"), row: DerivedCheckoutRowSchema }),
    z.strictObject({ kind: z.literal("unresolved"), checkoutPath: text,
      diagnostics: z.array(z.strictObject({ code: text, message: z.string() })).readonly() }),
  ]),
  primaryAvailability: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("free"), checkoutPath: z.string() }),
    z.strictObject({ kind: z.literal("occupied"), checkoutPath: z.string(), subject }),
    z.strictObject({ kind: z.literal("unsafe"), checkoutPath: z.string().nullable(), reasons: z.array(z.string()).readonly() }),
  ]),
  identityDiscovery: z.discriminatedUnion("kind", [
    StoreIdentityDiscoverySchema,
    z.strictObject({ kind: z.literal("absent") }),
    z.strictObject({ kind: z.literal("error"), stage: z.enum(["tip", "tree"]), message: z.string() }),
    z.strictObject({ kind: z.literal("complete"), identities: z.array(LocusIdentityV1Schema).readonly(),
      diagnostics: z.array(identityDiagnostic).readonly() }),
  ]),
  active: z.strictObject({ checkoutPath: text, subject: workUnit, context }).nullable(),
});
