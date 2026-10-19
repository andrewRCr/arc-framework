/** Closed terminal preview reports without backend placement or checkout implementation details. */
import { z } from "zod";
import { CanonicalDigestSchema } from "../kernel/index.js";
import { RecordReferenceSchema } from "../store/identity.js";
import { MutationSchema } from "../store/write.js";
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { CutMapMachineSchema } from "./cut-map-machine.js";
import { sortByCanonicalBytes } from "../kernel/canonical/canonical-json.js";
import { decomposeApplyAuthority } from "./apply-authority.js";
import type { DecomposeRetirementPlan } from "./retirement-plan.js";

/** A complete retirement write preview and the authority required to apply it. */
export const DecomposeRetirementPreviewSchema = z.strictObject({ kind: z.literal("preview"), mode: z.literal("retirement-finish"),
  origin: CutMapMachineSchema.shape.origin, applyAuthority: CanonicalDigestSchema, lineage: LineageRecordSchema,
  removals: z.array(RecordReferenceSchema), writes: z.array(MutationSchema),
});
/** Distribution approval packet for a prepared retirement. */
export type DecomposeRetirementPreview = z.infer<typeof DecomposeRetirementPreviewSchema>;

/** Describe the exact terminal mutations, including the primary removal supplied by the executor. */
export function reportDecomposeRetirementPreview(plan: DecomposeRetirementPlan): DecomposeRetirementPreview {
  const mode = "retirement-finish", origin = plan.input.map.machine.origin;
  return DecomposeRetirementPreviewSchema.parse({ kind: "preview", mode, origin,
    applyAuthority: decomposeApplyAuthority({ mode, origin, records: plan.records, writes: plan.writes }),
    lineage: plan.lineage.lineage, writes: sortByCanonicalBytes(plan.writes),
    removals: sortByCanonicalBytes(plan.writes.flatMap(write => write.action === "remove" ? [write.reference] : [])),
  });
}

/** Successful terminal persistence, with independently retryable physical cleanup when needed. */
export const DecomposeFinishAppliedSchema = z.strictObject({ kind: z.literal("applied"),
  origin: CutMapMachineSchema.shape.origin, members: LineageRecordSchema.shape.successors, notices: z.array(z.string()),
  continuation: z.strictObject({ kind: z.literal("git-step"), step: z.string(), reason: z.string(), argv: z.array(z.string()).min(1) }).optional(),
});
/** Terminal evidence that a cut has already landed, without applying any writes. */
export const DecomposeLandedCutSchema = z.strictObject({ kind: z.literal("landed"), mode: z.literal("retirement-finish"),
  origin: CutMapMachineSchema.shape.origin.partial({ uid: true }), members: LineageRecordSchema.shape.successors,
});
/** A landed cut's origin and recorded successor identities. */
export type DecomposeLandedCut = z.infer<typeof DecomposeLandedCutSchema>;

/** Closed finish report for preview, successful application, or an already landed cut. */
export const DecomposeFinishReportSchema = z.union([DecomposeRetirementPreviewSchema, DecomposeFinishAppliedSchema, DecomposeLandedCutSchema]);
/** Structured finish result without internal preparation or executor objects. */
export type DecomposeFinishReport = z.infer<typeof DecomposeFinishReportSchema>;
