/** Structural roots for starter and completed record-bound cut maps. */
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
