/** Versioned handoff authoring input and the complete write result. */
import { z } from "zod";
import { RecordReferenceSchema, StateVersionSchema } from "../store/identity.js";
import { StoreRefusalSchema, RemedySchema } from "../store/refusal.js";
import { HandoffTripwireReportSchema } from "./tripwires.js";
import type { KernelRegistry } from "../kernel/index.js";

/** Only session decisions are authored; both anchors are computed by the verb. */
export const HandoffWriteRequestSchema = z.strictObject({ schemaVersion: z.literal(1), sessionContext: z.string(),
  nextAction: z.string().trim().min(1), sessionType: z.enum(["planning", "execution"]).optional() });
/** Current handoff request. */
export type HandoffWriteRequest = z.infer<typeof HandoffWriteRequestSchema>;
const authoringRefusal = z.strictObject({ code: z.enum(["invalid-handoff-request", "no-current-work-unit", "git-head-unresolved", "unsupported-handoff", "work-unit-unreadable"]),
  class: z.literal("recoverable"), condition: z.string(), remedy: RemedySchema });
/** Landed writes remain successful if subsequent local maintenance fails. */
const serviceResult = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("written"), reference: RecordReferenceSchema, stateAtHandoff: StateVersionSchema,
    commitAtHandoff: z.string().min(1), maintenance: HandoffTripwireReportSchema, diagnostics: z.array(z.string()) }),
  z.strictObject({ status: z.literal("refused"), refusal: z.union([StoreRefusalSchema, authoringRefusal]) }),
]);
/** Service outcomes retain the backend's precise operation-refusal variants. */
export type HandoffWriteServiceResult = z.infer<typeof serviceResult>;
/** The public command also admits its pre-capability refusal before request acquisition. */
export const HandoffWriteResultSchema = z.union([serviceResult,
  z.strictObject({ status: z.literal("refused"), refusal: z.strictObject({ code: z.literal("unsupported"),
    class: z.literal("terminal"), condition: z.string(), remedy: z.strictObject({ text: z.string() }) }) }),
]);
/** A validated handoff write outcome. */
export type HandoffWriteResult = z.infer<typeof HandoffWriteResultSchema>;
/** Register the authored request and result in public schema discovery.
 * @param registry - Production schema registry.
 * @returns Registry with the handoff contracts registered.
 */
export function registerHandoffWriteSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(HandoffWriteRequestSchema, { id: "handoff-write-request", version: 1, migrationPosture: "strict-current" });
  registry.register(HandoffWriteResultSchema, { id: "handoff-write-result", version: 1, migrationPosture: "strict-current" });
  return registry;
}
