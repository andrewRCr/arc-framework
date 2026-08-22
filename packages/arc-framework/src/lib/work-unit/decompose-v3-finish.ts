/** Typed outcome contract for previewing or applying extraction source finish. */

import { z } from "zod";

/** Closed result shared by finish preview, application, and recovery. */
export const V3ExtractionFinishResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("previewed") }),
  z.strictObject({ status: z.literal("finished") }),
  z.strictObject({ status: z.literal("already-finished") }),
  z.strictObject({
    status: z.literal("refused"),
    reason: z.string().min(1),
    locus: z.string().min(1).optional(),
  }),
]);

/** Canonical machine result emitted by the extraction finish command. */
export type V3ExtractionFinishResult = z.infer<typeof V3ExtractionFinishResultSchema>;
