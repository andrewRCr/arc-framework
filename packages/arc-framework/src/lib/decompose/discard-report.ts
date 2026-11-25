/** Closed approval and application reports for removing an in-progress cut. */
import { z } from "zod";
import { CanonicalDigestSchema } from "../kernel/index.js";
import { RecordReferenceSchema } from "../store/identity.js";
import { MutationSchema } from "../store/write.js";
import { CutMapMachineSchema } from "./cut-map-machine.js";
import { CutCompletedAuthoringSchema } from "./cut-map-authoring.js";

const leftEdited = z.array(z.union([CutCompletedAuthoringSchema.shape.destinations.element.options[1],
  CutCompletedAuthoringSchema.shape.destinations.element.options[2]]));
const details = { origin: CutMapMachineSchema.shape.origin, removals: z.array(RecordReferenceSchema), leftEdited };

/** Exact removals, implicit conflict closures, and retained authoring shown for approval. */
export const DecomposeDiscardPreviewSchema = z.strictObject({ kind: z.literal("preview"), mode: z.literal("discard"),
  ...details, applyAuthority: CanonicalDigestSchema, writes: z.array(MutationSchema) });
/** Evidence of one discarded cut, with existing destinations left as authored. */
export const DecomposeDiscardAppliedSchema = z.strictObject({ kind: z.literal("discarded"), ...details });
/** A discard's complete public result. */
export const DecomposeDiscardReportSchema = z.union([DecomposeDiscardPreviewSchema, DecomposeDiscardAppliedSchema]);
/** Structured discard output without backend objects. */
export type DecomposeDiscardReport = z.infer<typeof DecomposeDiscardReportSchema>;
