/** Zod authority for canonical Git change facts and their review-policy view. */

import { z } from "zod";

import type { KernelRegistry } from "./kernel/index.js";

const PathSchema = z.string().min(1);
const PresentModeSchema = z.string().regex(/^(?:100644|100755|120000|160000)$/u);
const AbsentModeSchema = z.literal("000000");

function modeClass(mode: string): "regular" | "symlink" | "gitlink" | null {
  if (mode === "100644" || mode === "100755") return "regular";
  if (mode === "120000") return "symlink";
  if (mode === "160000") return "gitlink";
  return null;
}

const AddedChangeSchema = z.strictObject({
  status: z.literal("added"),
  path: PathSchema,
  previousPath: z.never().optional(),
  oldMode: AbsentModeSchema,
  newMode: PresentModeSchema,
}).refine((change) => !Object.hasOwn(change, "previousPath"), { message: "added changes have one endpoint" });
const ModifiedChangeSchema = z.strictObject({
  status: z.literal("modified"),
  path: PathSchema,
  previousPath: z.never().optional(),
  oldMode: PresentModeSchema,
  newMode: PresentModeSchema,
}).refine((change) => modeClass(change.oldMode) === modeClass(change.newMode), {
  message: "modified change modes must retain their object class",
}).refine((change) => !Object.hasOwn(change, "previousPath"), {
  message: "modified changes have one endpoint",
});
const DeletedChangeSchema = z.strictObject({
  status: z.literal("deleted"),
  path: PathSchema,
  previousPath: z.never().optional(),
  oldMode: PresentModeSchema,
  newMode: AbsentModeSchema,
}).refine((change) => !Object.hasOwn(change, "previousPath"), { message: "deleted changes have one endpoint" });
const RenamedChangeSchema = z.strictObject({
  status: z.literal("renamed"),
  path: PathSchema,
  previousPath: PathSchema,
  oldMode: PresentModeSchema,
  newMode: PresentModeSchema,
}).refine((change) => change.path !== change.previousPath, {
  message: "renamed endpoints must differ",
});
const CopiedChangeSchema = z.strictObject({
  status: z.literal("copied"),
  path: PathSchema,
  previousPath: PathSchema,
  oldMode: PresentModeSchema,
  newMode: PresentModeSchema,
}).refine((change) => change.path !== change.previousPath, {
  message: "copied endpoints must differ",
});
const TypeChangedSchema = z.strictObject({
  status: z.literal("type-changed"),
  path: PathSchema,
  previousPath: z.never().optional(),
  oldMode: PresentModeSchema,
  newMode: PresentModeSchema,
}).refine((change) => modeClass(change.oldMode) !== modeClass(change.newMode), {
  message: "type-changed modes must change object class",
}).refine((change) => !Object.hasOwn(change, "previousPath"), {
  message: "type-changed changes have one endpoint",
});

/** One validated six-status canonical change. */
export const CanonicalChangeSchema = z.union([
  AddedChangeSchema,
  ModifiedChangeSchema,
  DeletedChangeSchema,
  RenamedChangeSchema,
  CopiedChangeSchema,
  TypeChangedSchema,
]);
export type CanonicalChange = z.infer<typeof CanonicalChangeSchema>;

/** Known/unknown canonical change-set authority. */
export const ChangeSetSchema = z.discriminatedUnion("changeSet", [
  z.strictObject({ changeSet: z.literal("known"), changes: z.array(CanonicalChangeSchema).min(1) }),
  z.strictObject({ changeSet: z.literal("unknown"), changes: z.tuple([]) }),
]);
export type ChangeSet = z.infer<typeof ChangeSetSchema>;

const SinglePathFactSchema = z.union([
  z.strictObject({ status: z.literal("added"), path: PathSchema, previousPath: z.never().optional() }),
  z.strictObject({ status: z.literal("modified"), path: PathSchema, previousPath: z.never().optional() }),
  z.strictObject({ status: z.literal("deleted"), path: PathSchema, previousPath: z.never().optional() }),
  z.strictObject({ status: z.literal("type-changed"), path: PathSchema, previousPath: z.never().optional() }),
]).refine((change) => !Object.hasOwn(change, "previousPath"), {
  message: "single-path facts have one endpoint",
});
const DualPathFactSchema = z.union([
  z.strictObject({ status: z.literal("renamed"), path: PathSchema, previousPath: PathSchema }),
  z.strictObject({ status: z.literal("copied"), path: PathSchema, previousPath: PathSchema }),
]).refine((change) => change.path !== change.previousPath, {
  message: "move and copy endpoints must differ",
});

/** Mode-insensitive canonical view used by review policy consumers. */
export const ChangePathFactSchema = z.union([SinglePathFactSchema, DualPathFactSchema]);
export type ChangePathFact = z.infer<typeof ChangePathFactSchema>;

/** Known/unknown path-fact view shared by review policy consumers. */
export const ChangePathSetSchema = z.discriminatedUnion("changeSet", [
  z.strictObject({ changeSet: z.literal("known"), changes: z.array(ChangePathFactSchema).min(1) }),
  z.strictObject({ changeSet: z.literal("unknown"), changes: z.tuple([]) }),
]);
export type ChangePathSet = z.infer<typeof ChangePathSetSchema>;

/** Register canonical change-fact schemas with a caller-owned registry. */
export function registerChangeFactSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(CanonicalChangeSchema, {
    id: "canonical-change",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ChangeSetSchema, {
    id: "canonical-change-set",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ChangePathFactSchema, {
    id: "change-path-fact",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(ChangePathSetSchema, {
    id: "change-path-set",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
