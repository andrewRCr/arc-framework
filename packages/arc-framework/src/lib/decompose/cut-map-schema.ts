/** Structural roots for starter and completed record-bound cut maps. */
import type { KernelRegistry } from "../kernel/index.js";
import { z } from "zod";
import { CutMapMachineSchema } from "./cut-map-machine.js";
import { CutStarterAuthoringSchema, CutCompletedAuthoringSchema } from "./cut-map-authoring.js";

export const CutMapStarterSchema = z.strictObject({
  schemaVersion: z.literal(4), machine: CutMapMachineSchema, authoring: CutStarterAuthoringSchema,
});
export const CutMapSchema = z.strictObject({
  schemaVersion: z.literal(4), machine: CutMapMachineSchema, authoring: CutCompletedAuthoringSchema,
});
export type CutMapStarter = z.infer<typeof CutMapStarterSchema>;
export type CutMap = z.infer<typeof CutMapSchema>;

/** Publish the record-bound completed-map contract for request authoring. */
export function registerCutMapSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(CutMapSchema, {
    id: "cut-map", version: 4, migrationPosture: "strict-current", authored: "request",
  });
  return registry;
}
