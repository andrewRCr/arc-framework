/** Serializable clashes retained beside their record instead of inline markers. */

import { z } from "zod";
import { EntryIdSchema, RecordReferenceSchema } from "./identity.js";

/** Caller-supplied machine or session and observation time. */
export const SideLabelSchema = z.strictObject({ actor: z.string().min(1), time: z.iso.datetime() });
/** The label of one merge side. */
export type SideLabel = z.infer<typeof SideLabelSchema>;
/** One preserved side of a clash. */
export const ConflictSideSchema = z.strictObject({ content: z.string(), label: SideLabelSchema });
const entrySide = ConflictSideSchema.extend({ section: z.string() });
const entryLocation = z.strictObject({ kind: z.literal("entry"), id: EntryIdSchema });
const otherLocation = z.union([
  z.strictObject({ kind: z.literal("hunk"), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() })
    .refine((range) => range.end >= range.start),
  z.strictObject({ kind: z.literal("record") }),
]);
/** Entry, base line range, or whole-record locus; range endpoints are zero-based and end-exclusive. */
export const ConflictLocationSchema = z.union([entryLocation, otherLocation]);
const recordFields = {
  record: RecordReferenceSchema,
  base: z.string(),
  current: ConflictSideSchema,
  incoming: ConflictSideSchema,
};
/** The complete open clash, including all entry sections; null names an absent base entry. */
export const ConflictRecordSchema = z.union([
  z.strictObject({ ...recordFields, location: entryLocation, baseSection: z.string().nullable(), current: entrySide, incoming: entrySide }),
  z.strictObject({ ...recordFields, location: otherLocation }),
]);
/** A conflict whose current side remains visible until an explicit resolving write. */
export type ConflictRecord = z.infer<typeof ConflictRecordSchema>;
