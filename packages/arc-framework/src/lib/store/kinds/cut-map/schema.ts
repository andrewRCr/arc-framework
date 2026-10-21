/** Private stored-map bindings; external authored maps carry no allocation authority. */
import { z } from "zod";
import { SlugSchema } from "../../../kernel/index.js";
import { CutMapSchema } from "../../../decompose/cut-map-schema.js";

/** A selected cut's immutable primary birth name and history-derived binding. */
export const StoredCutOwnerBirthSchema = z.strictObject({
  kind: z.enum(["work-item/meta", "cohort/document"]), name: SlugSchema,
  birthKey: z.string().regex(/^[0-9a-f]{64}$/u),
});
/** Selected owner birth binding, without a caller-authored UID. */
export type StoredCutOwnerBirth = z.infer<typeof StoredCutOwnerBirthSchema>;

/** Compare bindings in canonical kind/name/key binary UTF-8 order. */
export function compareStoredCutOwnerBirths(left: StoredCutOwnerBirth, right: StoredCutOwnerBirth): number {
  for (const field of ["kind", "name", "birthKey"] as const) {
    const order = Buffer.compare(Buffer.from(left[field]), Buffer.from(right[field]));
    if (order !== 0) return order;
  }
  return 0;
}

/** The single-writer record keeps its authored map and generation selection together. */
export const StoredCutMapSchema = z.strictObject({ schemaVersion: z.literal(1), map: CutMapSchema,
  ownerBirths: z.array(StoredCutOwnerBirthSchema) }).superRefine((stored, context) => {
  const seen = new Set<string>();
  for (const [index, birth] of stored.ownerBirths.entries()) {
    const key = `${birth.kind}:${birth.name}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["ownerBirths", index], message: "Duplicate primary birth name" });
    seen.add(key);
    const previous = stored.ownerBirths[index - 1];
    if (previous !== undefined && compareStoredCutOwnerBirths(previous, birth) >= 0) {
      context.addIssue({ code: "custom", path: ["ownerBirths", index], message: "Bindings must be in binary UTF-8 order" });
    }
  }
}).superRefine((stored, context) => {
  const members = new Set(stored.map.authoring.destinations.flatMap(destination =>
    destination.kind === "new-member" ? [destination.slug] : []));
  for (const name of members) {
    if (!stored.ownerBirths.some(birth => birth.kind === "work-item/meta" && birth.name === name)) {
      context.addIssue({ code: "custom", path: ["ownerBirths"], message: `Missing member binding: ${name}` });
    }
  }
  const placement = stored.map.authoring.placement;
  const path = placement.kind === "direct-member" ? null : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  const cohorts = new Set(path?.split("/") ?? []);
  for (const birth of stored.ownerBirths) {
    if (!(birth.kind === "work-item/meta" ? members : cohorts).has(birth.name)) {
      context.addIssue({ code: "custom", path: ["ownerBirths"], message: `Binding is outside the selected map: ${birth.name}` });
    }
  }
});
/** Canonical private storage envelope. */
export type StoredCutMap = z.infer<typeof StoredCutMapSchema>;
