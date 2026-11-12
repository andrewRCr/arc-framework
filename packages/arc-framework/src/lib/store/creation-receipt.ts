/** Backend allocation evidence, independent of caller provenance and record content. */
import { z } from "zod";
import { SlugSchema } from "../kernel/index.js";
import { StoredUidSchema } from "./identity.js";

/** A primary actually created under a freshly allocated owner generation. */
export const CreatedOwnerSchema = z.union([
  z.strictObject({ kind: z.enum(["work-item/meta", "work-item/record"]),
    owner: z.strictObject({ type: z.literal("work-item"), name: SlugSchema, uid: StoredUidSchema }) }),
  z.strictObject({ kind: z.literal("cohort/document"),
    owner: z.strictObject({ type: z.literal("cohort"), name: SlugSchema, uid: StoredUidSchema }) }),
]);
/** One backend-proved primary birth. */
export type CreatedOwner = z.infer<typeof CreatedOwnerSchema>;

/** Compare complete birth facts in their canonical binary UTF-8 order. */
export function compareCreatedOwners(left: CreatedOwner, right: CreatedOwner): number {
  const pairs: readonly (readonly [string, string])[] = [[left.owner.type, right.owner.type], [left.owner.name, right.owner.name],
    [left.kind, right.kind], [left.owner.uid, right.owner.uid]];
  for (const [a, b] of pairs) {
    const order = Buffer.compare(Buffer.from(a), Buffer.from(b));
    if (order !== 0) return order;
  }
  return 0;
}

/** Complete, canonical birth inventory; distinct generations may share a birth name. */
export const CreatedOwnersSchema = z.array(CreatedOwnerSchema).superRefine((owners, context) => {
  const seen = new Set<string>();
  for (const [index, birth] of owners.entries()) {
    const key = `${birth.owner.type}:${birth.owner.uid}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: [index], message: "Duplicate owner generation" });
    seen.add(key);
    const previous = owners[index - 1];
    if (previous !== undefined && compareCreatedOwners(previous, birth) >= 0) {
      context.addIssue({ code: "custom", path: [index], message: "Birth inventory must be in binary UTF-8 order" });
    }
  }
});
/** Complete accepted-batch birth evidence; an empty inventory proves no births. */
export const BatchCreationReceiptSchema = z.strictObject({
  schemaVersion: z.literal(1), batchId: z.string().min(1), createdOwners: CreatedOwnersSchema,
});
/** Backend-owned fact retained on every selected history entry of its batch. */
export type BatchCreationReceipt = z.infer<typeof BatchCreationReceiptSchema>;
