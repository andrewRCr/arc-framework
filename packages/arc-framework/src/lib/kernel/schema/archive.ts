/** Archive labels shared by logical state and physical layout. */

import { z } from "zod";

/** Runtime authority for completed-archive quarters. */
export const ArchiveQuarterSchema = z.string().regex(/^\d{4}-q[1-4]$/u).brand<"ArchiveQuarter">();
/** A validated completed-archive quarter. */
export type ArchiveQuarter = z.infer<typeof ArchiveQuarterSchema>;

/** Runtime authority for completed-archive sequence identifiers. */
export const ArchiveSequenceSchema = z.string().regex(/^(?:0[1-9]|[1-9][0-9]+)$/u).brand<"ArchiveSequence">();
/** A validated completed-archive sequence identifier. */
export type ArchiveSequence = z.infer<typeof ArchiveSequenceSchema>;
