/** Serializable clashes retained beside their record instead of inline markers. */

import { z } from "zod";
import { EntryIdSchema, RecordReferenceSchema } from "./identity.js";
import { StoreRecordSchema } from "./read.js";

/** Caller-supplied machine or session and observation time. */
export const SideLabelSchema = z.strictObject({ actor: z.string().min(1), time: z.iso.datetime() });
/** The label of one merge side. */
export type SideLabel = z.infer<typeof SideLabelSchema>;
/** One preserved side of a clash. */
export const ConflictSideSchema = z.strictObject({ content: z.string(), label: SideLabelSchema });
const entrySide = ConflictSideSchema.extend({ section: z.string() });
const entryLocation = z.strictObject({ kind: z.literal("entry"), id: EntryIdSchema });
const hunkLocation = z.strictObject({ kind: z.literal("hunk"), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
  .refine((range) => range.end >= range.start);
const recordLocation = z.strictObject({ kind: z.literal("record") });
/** Entry, base line range, or whole-record locus; range endpoints are zero-based and end-exclusive. */
export const ConflictLocationSchema = z.union([entryLocation, hunkLocation, recordLocation]);
const recordFields = {
  record: RecordReferenceSchema,
  base: z.string(),
  current: ConflictSideSchema,
  incoming: ConflictSideSchema,
};
/** Text clashes keep entry sections or a base line range beside their preserved bytes. */
export const TextConflictRecordSchema = z.union([
  z.strictObject({ ...recordFields, location: entryLocation, baseSection: z.string().nullable(), current: entrySide, incoming: entrySide }),
  z.strictObject({ ...recordFields, location: hunkLocation }),
]);
/** Entry or hunk data emitted by the pure text merge library. */
export type TextConflictRecord = z.infer<typeof TextConflictRecordSchema>;
const { reference, content, version, formatVersion, placement, links } = StoreRecordSchema.shape;
/** Caller-observable record value; derived fields and open conflicts are recomputed on reads. */
export const ConflictRecordValueSchema = z.strictObject({ reference, content, version, formatVersion, placement, links })
  .superRefine((value, context) => {
    const parsed = StoreRecordSchema.safeParse({ ...value, conflicts: [] });
    if (!parsed.success) for (const issue of parsed.error.issues) context.addIssue({ ...issue });
  });
/** A present record preserved whole at a single-writer clash. */
export type ConflictRecordValue = z.infer<typeof ConflictRecordValueSchema>;
const recordSide = z.strictObject({ value: ConflictRecordValueSchema.nullable(), label: SideLabelSchema });
/** A whole-record clash preserves explicit absence and all accepted record metadata. */
export const WholeRecordConflictSchema = z.strictObject({
  record: RecordReferenceSchema, location: recordLocation, base: ConflictRecordValueSchema.nullable(),
  current: recordSide, incoming: recordSide,
});
/** Present or absent single-writer sides, each labelled by its actual writer. */
export type WholeRecordConflict = z.infer<typeof WholeRecordConflictSchema>;
/** The complete open clash; null denotes an absent whole-record value or base entry section. */
export const ConflictRecordSchema = z.union([TextConflictRecordSchema, WholeRecordConflictSchema]);
/** A conflict whose current side remains visible until an explicit resolving write. */
export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;
