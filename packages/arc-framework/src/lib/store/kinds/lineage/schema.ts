/** Closed reference and terminal lineage record schemas. */
import { z } from "zod";
import { BranchLinkSchema } from "../../links.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";

/** A work item's name at the transition, with its generation when available. */
export const WorkItemRefSchema = z.strictObject({ name: SlugSchema, uid: z.uuid().optional() });
/** One validated work-item reference in terminal history. */
export type WorkItemRef = z.infer<typeof WorkItemRefSchema>;

const OrderedReferencesSchema = z.array(WorkItemRefSchema).refine((values) =>
  values.every((value, index) => index === 0
    || Buffer.compare(Buffer.from(values[index - 1]?.name ?? "", "utf8"), Buffer.from(value.name, "utf8")) < 0),
"must be unique and canonically ordered by name");
const DispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("replace"), replacementTargets: OrderedReferencesSchema }),
  z.strictObject({ kind: z.literal("drop"), reason: z.string().refine((value) => value.trim() !== "", "must be non-empty") }),
]);
const IncomingSchema = z.strictObject({ dependent: WorkItemRefSchema, disposition: DispositionSchema });
const OutgoingSchema = z.strictObject({ prerequisite: WorkItemRefSchema, members: OrderedReferencesSchema });

/** Closed terminal lineage record and its cross-field invariants. */
export const LineageRecordSchema = z.strictObject({
  schemaVersion: z.literal(2),
  origin: WorkItemRefSchema,
  kind: z.enum(["decompose", "abandon", "rename"]),
  successors: OrderedReferencesSchema,
  incoming: z.array(IncomingSchema),
  outgoing: z.array(OutgoingSchema).optional(),
  retiredBranches: z.array(BranchLinkSchema).refine((links) => new Set(links.map((link) => JSON.stringify([link.repository, link.ref]))).size === links.length, "must contain unique repository-qualified branches").optional(),
}).superRefine((record, context) => {
  if (record.kind === "rename" && record.retiredBranches !== undefined) context.addIssue({ code: "custom", path: ["retiredBranches"], message: "only terminal abandonment and decomposition may retain branches" });
  const requiredCount = record.kind === "rename" ? 1 : record.kind === "abandon" ? 0 : null;
  if (requiredCount === null ? record.successors.length === 0 : record.successors.length !== requiredCount) {
    context.addIssue({ code: "custom", path: ["successors"], message: "invalid successor cardinality" });
  }
  if (record.kind !== "decompose" && record.incoming.length !== 0) {
    context.addIssue({ code: "custom", path: ["incoming"], message: "direct transitions cannot carry incoming dispositions" });
  }
  const dependents = record.incoming.map(({ dependent }) => dependent.name);
  if (new Set(dependents).size !== dependents.length) {
    context.addIssue({ code: "custom", path: ["incoming"], message: "dependents must be unique" });
  }
  if ((record.kind === "decompose") !== (record.outgoing !== undefined)) {
    context.addIssue({ code: "custom", path: ["outgoing"], message: "must be present exactly on a decomposition" });
  }
  const prerequisites = record.outgoing?.map(({ prerequisite }) => prerequisite.name) ?? [];
  if (new Set(prerequisites).size !== prerequisites.length) {
    context.addIssue({ code: "custom", path: ["outgoing"], message: "prerequisites must be unique" });
  }
});
/** One terminal transition recorded for a retired work-item origin. */
export type LineageRecord = z.infer<typeof LineageRecordSchema>;
