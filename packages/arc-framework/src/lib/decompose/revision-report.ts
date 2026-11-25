/** Closed approval and application reports for revising an in-progress cut. */
import { z } from "zod";
import { CanonicalDigestSchema, SlugSchema } from "../kernel/index.js";
import { RecordReferenceSchema } from "../store/identity.js";
import { MutationSchema } from "../store/write.js";
import { CutMapMachineSchema } from "./cut-map-machine.js";

const details = { origin: CutMapMachineSchema.shape.origin, members: z.array(SlugSchema), removals: z.array(RecordReferenceSchema) };
/** Complete mutations and approval bound to current record versions. */
export const DecomposeRevisionPreviewSchema = z.strictObject({ kind: z.literal("preview"), mode: z.literal("revise"),
  ...details, applyAuthority: CanonicalDigestSchema, writes: z.array(MutationSchema) });
/** One applied revision, with its current member names and removed references. */
export const DecomposeRevisionAppliedSchema = z.strictObject({ kind: z.literal("revised"), ...details });
/** Revision results carry no backend objects. */
export const DecomposeRevisionReportSchema = z.union([DecomposeRevisionPreviewSchema, DecomposeRevisionAppliedSchema]);
/** The complete revision result. */
export type DecomposeRevisionReport = z.infer<typeof DecomposeRevisionReportSchema>;
