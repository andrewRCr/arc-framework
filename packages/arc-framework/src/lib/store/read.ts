/** Store records and completeness-preserving listing outcomes. */

import { z } from "zod";
import { FAMILY_IDS, type FamilyId } from "./catalog.js";
import { FormatVersionSchema, KindIdSchema, OwnerIdentitySchema, RecordReferenceSchema, RecordVersionSchema, StateVersionSchema } from "./identity.js";
import { LinksSchema } from "./links.js";
import { ErrandReadPlacementSchema, LocationSchema, ReadPlacementSchema, WorkUnitReadPlacementSchema } from "./placement.js";
import { RemedySchema } from "./refusal.js";

/** Storage family runtime authority. */
export const FamilyIdSchema = z.enum(FAMILY_IDS);
/** Logical record data, never a projected path. */
export const StoreRecordSchema = z.strictObject({
  reference: RecordReferenceSchema,
  content: z.string(),
  version: RecordVersionSchema,
  formatVersion: FormatVersionSchema,
  conflicts: z.array(RecordReferenceSchema),
  fields: z.unknown().optional(),
  placement: ReadPlacementSchema.optional(),
  links: LinksSchema.optional(),
}).superRefine((value, context) => {
  const belongsToWorkItem = value.reference.kind.startsWith("work-item/") || value.reference.kind.startsWith("review/");
  if (belongsToWorkItem && !value.reference.kind.endsWith("/conflict-record")
    && value.reference.owner.type === "work-item" && value.placement === undefined) {
    context.addIssue({ code: "custom", message: "Work-item records require placement" });
  }
  if (value.reference.kind === "work-item/meta" && !WorkUnitReadPlacementSchema.safeParse(value.placement).success) {
    context.addIssue({ code: "custom", message: "Invalid work-unit read placement" });
  }
  if (value.reference.kind === "work-item/record" && !ErrandReadPlacementSchema.safeParse(value.placement).success) {
    context.addIssue({ code: "custom", message: "Invalid Errand read placement" });
  }
  const primary = value.reference.kind === "work-item/meta" || value.reference.kind === "work-item/record";
  if (!primary && value.links !== undefined) context.addIssue({ code: "custom", message: "Only primary records carry links" });
});
/** A record with exact mutation basis and conflict references. */
export type StoreRecord = z.infer<typeof StoreRecordSchema>;
/** Material failure modes for one entry in an otherwise readable family. */
export const ListingDiagnosticSchema = z.strictObject({
  kind: z.enum(["malformed", "oversized", "unreadable", "unknown-format-version", "key-mismatch"]),
  key: z.string().min(1),
  condition: z.string().min(1),
  remedy: RemedySchema,
  /** Producer evidence that placement is the sole failure after content and coordinates validated. */
  rule: z.literal("placement").optional(),
}).refine((value) => value.rule === undefined || value.kind === "malformed", "Placement evidence requires a malformed diagnostic");
/** An entry the family listing could not read safely. */
export type ListingDiagnostic = z.infer<typeof ListingDiagnosticSchema>;
/** Complete means enumeration completed, including every unreadable-entry diagnostic. */
export const ListingOutcomeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("absent"), asOf: StateVersionSchema.optional() }),
  z.strictObject({ status: z.literal("unreadable"), condition: z.string().min(1), remedy: RemedySchema }),
  z.strictObject({ status: z.literal("complete"), records: z.array(StoreRecordSchema), diagnostics: z.array(ListingDiagnosticSchema), missed: z.boolean(), asOf: StateVersionSchema.optional() }),
]);
/** A completeness-preserving family listing. */
export type ListingOutcome = z.infer<typeof ListingOutcomeSchema>;
/** Narrow a listing by logical lifecycle locations and interim checkout ownership. */
export const ListingFilterSchema = z.strictObject({ locations: z.array(LocationSchema).optional(), heldHere: z.boolean().optional() });
/** Read one record, optionally from a saved state. */
export const ReadInputSchema = z.strictObject({ reference: RecordReferenceSchema, asOf: StateVersionSchema.optional() });
/** A record read request. */
export type ReadInput = z.infer<typeof ReadInputSchema>;
/** List family records using exact owner identities, never path construction. */
export const ListInputSchema = z.strictObject({
  family: FamilyIdSchema,
  kind: KindIdSchema.optional(),
  owner: OwnerIdentitySchema.optional(),
  filter: ListingFilterSchema.optional(),
  asOf: StateVersionSchema.optional(),
}).refine((value) => value.kind === undefined || value.kind.startsWith(`${value.family}/`), "Kind must belong to the listed family");
/** A logical family enumeration request. */
export type ListInput = z.infer<typeof ListInputSchema>;
/** Backend capability report has exactly one behavioral distinction. */
export const StoreCapabilitiesSchema = z.strictObject({ stateOffBranch: z.boolean() });
/** Whether operational state lives off the checkout's code branch. */
export type StoreCapabilities = z.infer<typeof StoreCapabilitiesSchema>;
/** Typed family list shared by sync reports. */
export type StoreFamilies = readonly FamilyId[];
