/** Validated messages exchanged with independent real-Git store writers. */
import { z } from "zod";
import { BatchResultSchema, RecordReferenceSchema, StoreRefusalSchema, WriteInputSchema, WriteResultSchema, storeResultSchema } from "../../../src/lib/store/index.js";

const identity = z.string().min(1);
export const RefProcessJobSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("burst"), identity, writer: z.number().int().nonnegative(), iterations: z.number().int().positive() }),
  z.strictObject({ mode: z.literal("write"), identity, input: WriteInputSchema, pause: z.boolean() }),
  z.strictObject({ mode: z.literal("lifecycle"), identity, primary: RecordReferenceSchema, action: z.enum(["archive", "abandon", "reopen", "reopen-and-archive"]) }),
]);
export type RefProcessJob = z.infer<typeof RefProcessJobSchema>;
export const RefProcessReportSchema = z.strictObject({
  outcomes: z.array(storeResultSchema(z.union([WriteResultSchema, BatchResultSchema]))),
  retries: z.array(z.number().int().nonnegative().max(4)), refusals: z.array(StoreRefusalSchema),
});
export type RefProcessReport = z.infer<typeof RefProcessReportSchema>;
