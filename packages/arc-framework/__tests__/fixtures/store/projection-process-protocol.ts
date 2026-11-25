/** Validated rendezvous and editor commands for independent projection processes. */
import { z } from "zod";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";
import { RemedySchema } from "../../../src/lib/store/refusal.js";

export const ProjectionHookSchema = z.enum(["afterRecheck", "afterMove", "afterFirstCheck", "beforeRebuildLink", "beforeTarget",
  "beforeAsideCopy", "beforeLastCheck"]);
export type ProjectionHook = z.infer<typeof ProjectionHookSchema>;
export const ProjectionPersistResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("persisted") }),
  z.strictObject({ kind: z.literal("refused"), remedy: RemedySchema }),
]);
export interface ProjectionProcessReply {
  readonly report: string;
  readonly persist?: z.infer<typeof ProjectionPersistResultSchema>;
  readonly observedSave?: boolean;
}
export const ProjectionProcessJobSchema = z.strictObject({ root: z.string().min(1), editorRoot: z.string().min(1),
  path: z.string().min(1), reference: RecordReferenceSchema });
export type ProjectionProcessJob = z.infer<typeof ProjectionProcessJobSchema>;
const id = z.number().int().positive();
export const ProjectionProcessCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ id, action: z.literal("run"), operation: z.enum(["refresh", "fan-out", "persist"]),
    hook: ProjectionHookSchema.nullable(), content: z.string().optional(), expectedSave: z.string().min(1).optional() }),
  z.strictObject({ id, action: z.literal("open") }),
  z.strictObject({ id, action: z.literal("save"), content: z.string(), mode: z.enum(["handle", "truncate", "create", "rename"]) }),
  z.strictObject({ id, action: z.literal("release"), sequence: id }),
  z.strictObject({ id, action: z.literal("close") }),
]);
export type ProjectionProcessCommand = z.infer<typeof ProjectionProcessCommandSchema>;
export const ProjectionProcessMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), pid: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("hook"), sequence: id, hook: ProjectionHookSchema, root: z.string(), path: z.string() }),
  z.strictObject({ kind: z.literal("done"), id, report: z.string().optional(), persist: ProjectionPersistResultSchema.optional(),
    observedSave: z.boolean().optional() }),
  z.strictObject({ kind: z.literal("error"), id, error: z.string() }),
]);
export type ProjectionProcessMessage = z.infer<typeof ProjectionProcessMessageSchema>;
