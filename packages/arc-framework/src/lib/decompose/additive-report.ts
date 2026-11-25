/** Structured authoring instructions derived from one landed additive batch. */
import { z } from "zod";
import { SlugSchema } from "../kernel/index.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../store/identity.js";
import { CutMapSchema } from "./cut-map-schema.js";
import type { DecomposeAdditiveApplied } from "./additive.js";
import { decomposeFinishArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";

const source = CutMapSchema.shape.machine.shape.sourceUnits.element;
const copy = z.strictObject({ basename: z.string().min(1), reference: RecordReferenceSchema });
/** Closed report of created records, allocation requirements, and the authoring continuation. */
export const DecomposeAdditiveReportSchema = z.strictObject({
  origin: SlugSchema,
  batchId: z.string().min(1),
  storedMap: RecordReferenceSchema,
  members: z.array(z.strictObject({ slug: SlugSchema, meta: RecordReferenceSchema, copies: z.array(copy) })),
  cohorts: z.array(z.strictObject({ path: z.string().min(1), reference: RecordReferenceSchema })),
  records: z.array(RecordReferenceSchema),
  authoring: z.array(z.strictObject({ destination: CutMapSchema.shape.authoring.shape.destinations.element,
    allocations: z.array(source.pick({ sourceId: true, sourceLocator: true }).extend({
      ownership: z.enum(["destination-owned", "cohort-shared"]), targetLocator: source.shape.sourceLocator,
    })) })),
  nextStep: z.strictObject({ kind: z.literal("author-then-preview"), text: z.string().min(1), argv: z.array(z.string()).min(1) }),
});
/** Additive completion packet, independent of the store's placement layout. */
export type DecomposeAdditiveReport = z.infer<typeof DecomposeAdditiveReportSchema>;

/** Describe landed records and every destination's required authoring without another store read. */
export function reportDecomposeAdditive(applied: Omit<DecomposeAdditiveApplied, "report">): DecomposeAdditiveReport {
  const argv = decomposeFinishArgv(applied.map.machine.origin.slug);
  return DecomposeAdditiveReportSchema.parse({ origin: applied.map.machine.origin.slug, batchId: applied.batch.batchId,
    storedMap: landedReference(applied, applied.storedMap), records: applied.batch.writes.map(write => write.reference),
    members: applied.members.map(member => ({ slug: member.slug, meta: landedReference(applied, member.primary),
      copies: member.copies.map(copy => ({ basename: copy.basename, reference: landedReference(applied, copy.reference) })) })),
    cohorts: applied.cohorts.map(cohort => ({ path: cohort.path, reference: landedReference(applied, cohort.reference) })),
    authoring: applied.map.authoring.destinations.map(destination => ({ destination,
      allocations: applied.map.authoring.sourceAllocations.flatMap(allocation => {
        if (allocation.disposition.kind !== "target" || allocation.disposition.destinationId !== destination.destinationId) return [];
        const unit = applied.map.machine.sourceUnits.find(candidate => candidate.sourceId === allocation.sourceId);
        if (unit === undefined) throw new Error("The landed map contains an allocation without its bound source unit.");
        return [{ sourceId: unit.sourceId, sourceLocator: unit.sourceLocator, ownership: allocation.ownership,
          targetLocator: allocation.disposition.targetLocator }];
      }) })),
    nextStep: { kind: "author-then-preview", text: `Author the allocated content in each destination, then preview the distribution with ${renderV3DecomposeArgv(argv)}.`, argv },
  });
}

function landedReference(applied: Omit<DecomposeAdditiveApplied, "report">, reference: RecordReference): RecordReference {
  const landed = applied.batch.writes.find(write => sameReference(write.reference, reference)
    || (reference.owner.type !== "person" && reference.owner.uid === undefined && write.reference.owner.type === reference.owner.type
      && write.reference.owner.name === reference.owner.name && write.reference.kind === reference.kind && write.reference.key === reference.key));
  if (landed === undefined) throw new Error("The additive batch did not return a reported record.");
  return landed.reference;
}
