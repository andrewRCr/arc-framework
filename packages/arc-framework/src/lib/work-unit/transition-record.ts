/** Closed schema and deterministic codec for origin-keyed terminal transition history. */

import { z } from "zod";

import { canonicalize } from "../kernel/canonical/canonical-json.js";
import { SlugSchema } from "../kernel/schema/slug.js";

const TransitionSlugSchema = SlugSchema.transform((value): string => value);
const ReplaceDispositionSchema = z.strictObject({
  kind: z.literal("replace"),
  replacementTargets: z.array(TransitionSlugSchema),
});
const DropDispositionSchema = z.strictObject({
  kind: z.literal("drop"),
  reason: z.string().refine((value) => value.trim() !== "", "must be non-empty"),
});
const TransitionEdgeSchema = z.strictObject({
  dependent: TransitionSlugSchema,
  disposition: z.discriminatedUnion("kind", [ReplaceDispositionSchema, DropDispositionSchema]),
});
/** Validated terminal transition shape, including its origin and successor invariants. */
export const TransitionRecordSchema = z.strictObject({
  schemaVersion: z.literal(1),
  origin: TransitionSlugSchema,
  kind: z.enum(["decompose", "rename", "abandon"]),
  successors: z.array(TransitionSlugSchema),
  edges: z.array(TransitionEdgeSchema),
}).superRefine((record, ctx) => {
  const requiredSuccessorCount = record.kind === "rename" ? 1 : record.kind === "abandon" ? 0 : null;
  if (requiredSuccessorCount === null ? record.successors.length === 0
    : record.successors.length !== requiredSuccessorCount) {
    ctx.addIssue({ code: "custom", path: ["successors"], message: "invalid successor cardinality" });
  }
  if (!strictlyOrdered(record.successors)) {
    ctx.addIssue({ code: "custom", path: ["successors"], message: "must be unique and canonically ordered" });
  }
  const dependents = record.edges.map(({ dependent }) => dependent);
  if (new Set(dependents).size !== dependents.length) {
    ctx.addIssue({ code: "custom", path: ["edges"], message: "dependents must be unique" });
  }
  if (record.kind !== "decompose" && record.edges.length !== 0) {
    ctx.addIssue({ code: "custom", path: ["edges"], message: "direct transitions cannot carry edge dispositions" });
  }
  for (const [index, edge] of record.edges.entries()) {
    if (edge.disposition.kind === "replace" && !strictlyOrdered(edge.disposition.replacementTargets)) {
      ctx.addIssue({
        code: "custom",
        path: ["edges", index, "disposition", "replacementTargets"],
        message: "must be unique and canonically ordered",
      });
    }
  }
});

/** One terminal transition recorded for a retired work-unit origin. */
export type TransitionRecord = z.infer<typeof TransitionRecordSchema>;

/** Parse one untrusted JSON transition record. */
export function parseTransitionRecord(content: string): TransitionRecord | null {
  let candidate: unknown;
  try {
    candidate = JSON.parse(content) as unknown;
  } catch {
    return null;
  }
  const parsed = TransitionRecordSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Serialize one transition record for deterministic storage. */
export function serializeTransitionRecord(record: TransitionRecord): string {
  const parsed = TransitionRecordSchema.parse(record);
  return canonicalize({
    ...parsed,
    edges: [...parsed.edges].sort((left, right) => compareUtf8(left.dependent, right.dependent)),
  });
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function strictlyOrdered(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareUtf8(values[index - 1] ?? "", value) < 0);
}
