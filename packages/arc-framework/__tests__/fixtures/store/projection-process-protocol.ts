/** Validated rendezvous and editor commands for independent projection processes. */
import { z } from "zod";
import { RecordReferenceSchema } from "../../../src/lib/store/identity.js";

export const ProjectionHookSchema = z.enum(["afterRecheck", "afterMove", "afterFirstCheck", "beforeRebuildLink", "beforeTarget"]);
export type ProjectionHook = z.infer<typeof ProjectionHookSchema>;
export const ProjectionProcessJobSchema = z.strictObject({ root: z.string().min(1), editorRoot: z.string().min(1),
  path: z.string().min(1), reference: RecordReferenceSchema });
export type ProjectionProcessJob = z.infer<typeof ProjectionProcessJobSchema>;
const id = z.number().int().positive();
export const ProjectionProcessCommandSchema = z.discriminatedUnion("action", [
  z.strictObject({ id, action: z.literal("run"), operation: z.enum(["refresh", "fan-out"]),
    hook: ProjectionHookSchema.nullable(), content: z.string().optional() }),
  z.strictObject({ id, action: z.literal("open") }),
  z.strictObject({ id, action: z.literal("save"), content: z.string(), mode: z.enum(["handle", "truncate", "create", "rename"]) }),
  z.strictObject({ id, action: z.literal("release"), sequence: id }),
  z.strictObject({ id, action: z.literal("close") }),
]);
export type ProjectionProcessCommand = z.infer<typeof ProjectionProcessCommandSchema>;
export const ProjectionProcessMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ready"), pid: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("hook"), sequence: id, hook: ProjectionHookSchema, root: z.string(), path: z.string() }),
  z.strictObject({ kind: z.literal("done"), id, report: z.string().optional() }),
  z.strictObject({ kind: z.literal("error"), id, error: z.string() }),
]);
export type ProjectionProcessMessage = z.infer<typeof ProjectionProcessMessageSchema>;
