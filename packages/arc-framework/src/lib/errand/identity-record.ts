/** Strict backward-compatible identity records for Errands and grooming claims. */

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { SlugSchema } from "../kernel/index.js";
import {
  LocusChangeRequestV1Schema,
  LocusGitOidSchema,
  LocusIdentityV1Schema,
  LocusOpaqueTextSchema,
  LocusTimestampSchema,
  LocusTokenSchema,
  type LocusIdentityV1,
} from "../locus/schema/index.js";

const LegacyBaseShape = {
  slug: SlugSchema,
  origin: z.enum(["description", "inbox"]),
  intent: z.string().max(4_096),
  branch: LocusOpaqueTextSchema,
  createdAt: LocusTimestampSchema,
};
const LegacyV1Schema = z.strictObject({
  version: z.literal(1),
  ...LegacyBaseShape,
  originEntry: LocusOpaqueTextSchema.optional(),
}).superRefine(validateLegacyOrigin);
const LegacyV2Schema = z.strictObject({
  version: z.literal(2),
  ...LegacyBaseShape,
  originEntry: LocusOpaqueTextSchema.optional(),
  returnBranch: LocusOpaqueTextSchema.optional(),
}).superRefine(validateLegacyOrigin);

const V3CommonShape = {
  version: z.literal(3),
  slug: SlugSchema,
  claimId: LocusTokenSchema,
  createdAt: LocusTimestampSchema,
  updatedAt: LocusTimestampSchema,
};
const OrdinaryBaseShape = {
  ...V3CommonShape,
  kind: z.literal("errand"),
  purpose: z.literal("errand"),
  intent: z.string().max(4_096),
  branch: LocusOpaqueTextSchema,
};
const DescriptionOriginShape = {
  origin: z.literal("description"),
  originEntry: z.null(),
};
const InboxOriginShape = {
  origin: z.literal("inbox"),
  originEntry: LocusOpaqueTextSchema,
};
const OpenStateShape = { state: z.literal("open"), savedHead: z.null(), changeRequest: z.null() };
const PausedStateShape = { state: z.literal("paused"), savedHead: LocusGitOidSchema, changeRequest: z.null() };
const AwaitingStateShape = {
  state: z.literal("awaiting-merge"),
  savedHead: z.null(),
  changeRequest: LocusChangeRequestV1Schema,
};
const ordinarySchemas = [DescriptionOriginShape, InboxOriginShape].flatMap((origin) => [
  z.strictObject({ ...OrdinaryBaseShape, ...origin, ...OpenStateShape }),
  z.strictObject({ ...OrdinaryBaseShape, ...origin, ...PausedStateShape }),
  z.strictObject({ ...OrdinaryBaseShape, ...origin, ...AwaitingStateShape }),
]).map((schema) => schema.superRefine((value, context) => {
  validateOrdinaryNamespace(value, context);
  validateV3Lifecycle(value, context);
}));

const RoutingBaseShape = {
  ...V3CommonShape,
  kind: z.literal("errand"),
  purpose: z.literal("housekeep-routing"),
  branch: LocusOpaqueTextSchema,
};
const routingSchemas = [
  z.strictObject({ ...RoutingBaseShape, ...OpenStateShape }),
  z.strictObject({ ...RoutingBaseShape, ...AwaitingStateShape }),
].map((schema) => schema.superRefine((value, context) => {
  validateErrandBranch(value, context);
  validateV3Lifecycle(value, context);
}));

const GroomBaseShape = {
  ...V3CommonShape,
  kind: z.literal("groom"),
  anchorStub: SlugSchema,
  members: z.array(SlugSchema).min(1),
  openedBaseHead: LocusGitOidSchema,
};
const groomSchemas = [
  z.strictObject({
    ...GroomBaseShape,
    protection: z.literal("full"),
    branch: LocusOpaqueTextSchema,
    state: z.literal("open"),
    changeRequest: z.null(),
  }),
  z.strictObject({
    ...GroomBaseShape,
    protection: z.literal("full"),
    branch: LocusOpaqueTextSchema,
    state: z.literal("awaiting-merge"),
    changeRequest: LocusChangeRequestV1Schema,
  }),
  z.strictObject({
    ...GroomBaseShape,
    protection: z.literal("partial"),
    branch: z.null(),
    state: z.literal("open"),
    changeRequest: z.null(),
  }),
].map((schema) => schema.superRefine((value, context) => {
  validateGroom(value, context);
  validateV3Lifecycle(value, context);
}));

/** Strict runtime authority for new v3 identity writes. */
export const TransientIdentityRecordV3Schema = z.union([
  ...ordinarySchemas,
  ...routingSchemas,
  ...groomSchemas,
]);

/** Strict runtime authority for close-only legacy plus current identity records. */
export const TransientIdentityRecordSchema = z.union([
  LegacyV1Schema,
  LegacyV2Schema,
  TransientIdentityRecordV3Schema,
]);

export type TransientIdentityRecordV3 = z.infer<typeof TransientIdentityRecordV3Schema>;
export type TransientIdentityRecord = z.infer<typeof TransientIdentityRecordSchema>;

/** State-changing verbs that can encounter a transient identity record. */
export type TransientIdentityOperation =
  | "read"
  | "open"
  | "link"
  | "leave"
  | "resume"
  | "promote"
  | "retire"
  | "abandon"
  | "close";

/** Typed refusal when a legacy generation reaches a non-close mutation. */
export class LegacyIdentityOperationError extends Error {
  readonly operation: TransientIdentityOperation;
  readonly record: Extract<TransientIdentityRecord, { version: 1 | 2 }>;

  constructor(
    operation: TransientIdentityOperation,
    record: Extract<TransientIdentityRecord, { version: 1 | 2 }>,
  ) {
    super(`Legacy identity '${record.slug}' is close-only; cannot ${operation}`);
    this.name = "LegacyIdentityOperationError";
    this.operation = operation;
    this.record = record;
  }
}

/**
 * Enforce the bounded compatibility policy before a state-changing operation.
 *
 * @param record - Valid identity record at the requested key.
 * @param operation - Mutation the caller intends to perform.
 */
export function assertTransientIdentityOperation(
  record: TransientIdentityRecord,
  operation: TransientIdentityOperation,
): void {
  if (record.version !== 3 && operation !== "close" && operation !== "read") {
    throw new LegacyIdentityOperationError(operation, record);
  }
}

/** Mint an immutable 128-bit claim generation. */
export function mintClaimId(): string {
  return randomBytes(16).toString("hex");
}

/** Serialize one validated record with stable key order and terminal newline. */
export function serializeTransientIdentityRecord(record: TransientIdentityRecord): string {
  return `${JSON.stringify(TransientIdentityRecordSchema.parse(record), null, 2)}\n`;
}

export type TransientIdentityDecodeResult =
  | { kind: "valid"; record: TransientIdentityRecord }
  | { kind: "malformed"; message: string }
  | { kind: "unknown-version"; version: unknown }
  | { kind: "key-mismatch"; key: string; slug: string };

/** Decode one untrusted identity blob without collapsing failures into absence. */
export function deserializeTransientIdentityRecord(
  blob: string,
  key: string,
): TransientIdentityDecodeResult {
  let value: unknown;
  try {
    value = JSON.parse(blob);
  } catch (error) {
    return { kind: "malformed", message: error instanceof Error ? error.message : "Invalid JSON" };
  }
  if (isRecord(value) && value.version !== 1 && value.version !== 2 && value.version !== 3) {
    return { kind: "unknown-version", version: value.version };
  }
  const parsed = TransientIdentityRecordSchema.safeParse(value);
  if (!parsed.success) return { kind: "malformed", message: parsed.error.message };
  if (parsed.data.slug !== key) return { kind: "key-mismatch", key, slug: parsed.data.slug };
  return { kind: "valid", record: parsed.data };
}

/** Project a valid v3 authority into the public locus identity contract. */
export function projectLocusIdentity(record: TransientIdentityRecordV3): LocusIdentityV1 {
  if (record.kind === "groom") {
    return LocusIdentityV1Schema.parse({
      kind: "groom",
      key: record.slug,
      claimId: record.claimId,
      purpose: null,
      anchorStub: record.anchorStub,
      members: record.members,
      openedBaseHead: record.openedBaseHead,
      protection: record.protection,
      branch: record.branch,
      state: record.state,
      savedHead: null,
      changeRequest: record.changeRequest,
    });
  }
  if (record.purpose === "housekeep-routing") {
    return LocusIdentityV1Schema.parse({
      kind: "errand",
      key: record.slug,
      claimId: record.claimId,
      protection: "full",
      branch: record.branch,
      purpose: record.purpose,
      state: record.state,
      savedHead: null,
      changeRequest: record.changeRequest,
    });
  }
  return LocusIdentityV1Schema.parse({
    kind: "errand",
    key: record.slug,
    claimId: record.claimId,
    protection: "full",
    branch: record.branch,
    purpose: record.purpose,
    origin: record.origin,
    originEntry: record.originEntry,
    state: record.state,
    savedHead: record.savedHead,
    changeRequest: record.changeRequest,
  });
}

function validateLegacyOrigin(
  value: { origin: "description" | "inbox"; originEntry?: string },
  context: z.RefinementCtx,
): void {
  if (value.origin === "inbox" && value.originEntry === undefined) {
    context.addIssue({ code: "custom", path: ["originEntry"], message: "Inbox origin requires entry" });
  }
  if (value.origin === "description" && value.originEntry !== undefined) {
    context.addIssue({ code: "custom", path: ["originEntry"], message: "Description origin rejects entry" });
  }
}

function validateOrdinaryNamespace(
  value: { slug: string; branch: string },
  context: z.RefinementCtx,
): void {
  if (value.slug.startsWith("groom-")) {
    context.addIssue({ code: "custom", path: ["slug"], message: "groom-* namespace is reserved" });
  }
  validateErrandBranch(value, context);
}

function validateErrandBranch(
  value: { slug: string; branch: string },
  context: z.RefinementCtx,
): void {
  if (value.branch !== `chore/${value.slug}`) {
    context.addIssue({ code: "custom", path: ["branch"], message: "Branch must derive from slug" });
  }
}

function validateGroom(
  value: { slug: string; anchorStub: string; members: string[]; protection: string; branch: string | null },
  context: z.RefinementCtx,
): void {
  const expectedSlug = `groom-${value.anchorStub}`;
  if (value.slug !== expectedSlug) {
    context.addIssue({ code: "custom", path: ["slug"], message: "Groom slug must derive from anchor" });
  }
  if (value.protection === "full" && value.branch !== `chore/${expectedSlug}`) {
    context.addIssue({ code: "custom", path: ["branch"], message: "Full groom branch must derive from anchor" });
  }
  const sorted = [...value.members].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  if (!value.members.includes(value.anchorStub)
    || new Set(value.members).size !== value.members.length
    || sorted.some((member, index) => member !== value.members[index])) {
    context.addIssue({ code: "custom", path: ["members"], message: "Members must be unique, byte-sorted, and contain anchor" });
  }
}

function validateV3Lifecycle(
  value: { createdAt: string; updatedAt: string; branch: string | null; changeRequest?: { headRef: string } | null },
  context: z.RefinementCtx,
): void {
  if (Date.parse(value.updatedAt) < Date.parse(value.createdAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "updatedAt cannot precede createdAt" });
  }
  if (value.changeRequest !== null && value.changeRequest !== undefined
    && value.changeRequest.headRef !== value.branch) {
    context.addIssue({ code: "custom", path: ["changeRequest", "headRef"], message: "Change-request head must match branch" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
