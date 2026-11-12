/** Shared parsed fields for drafts, specs, and companions. */
import { z } from "zod";

/** Runtime narrowing for a design artifact's decoded fields. */
export const ParsedDesignRecordSchema = z.strictObject({ purpose: z.string().nullable() });
/** Raw nullable Purpose shared by all design artifact kinds. */
export type ParsedDesignRecord = z.infer<typeof ParsedDesignRecordSchema>;
