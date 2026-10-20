/** Portable operation locators retain the exact admitted work-item generation. */
import { z } from "zod";
import { OwnerIdentitySchema } from "../../../lib/store/identity.js";
import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";

const PREFIX = "arc-review-operation:v1:";
const ReferenceSchema = z.string().trim().min(1);

/** Portable coordinates shared by native operation and result locators. */
export const NativeReviewOperationReferenceSchema = z.strictObject({
  repositoryId: ReviewIdentifierSchema,
  workItem: OwnerIdentitySchema.refine(owner => owner.type === "work-item" && owner.uid !== undefined,
    "native review references require an exact work-item UID"),
  operationId: ReviewIdentifierSchema,
});
/** Coordinates retained by an admitted native operation. */
export type NativeReviewOperationReference = z.infer<typeof NativeReviewOperationReferenceSchema>;

/** Encode the admitted owner's portable operation locator. */
export function bindNativeReviewOperationReference(input: NativeReviewOperationReference): string {
  return `${PREFIX}${encodeURIComponent(JSON.stringify(NativeReviewOperationReferenceSchema.parse(input)))}`;
}

/** Decode an operation locator without trusting its owner or operation coordinates. */
export function parseNativeReviewOperationReference(reference: string): NativeReviewOperationReference {
  const value = ReferenceSchema.parse(reference);
  if (!value.startsWith(PREFIX)) throw new Error("native review operation reference kind or version mismatch");
  return NativeReviewOperationReferenceSchema.parse(JSON.parse(decodeURIComponent(value.slice(PREFIX.length))) as unknown);
}

/** A validated opaque locator for published native continuation fields. */
export const NativeReviewOperationRefSchema = ReferenceSchema.refine(reference => {
  try { parseNativeReviewOperationReference(reference); return true; } catch { return false; }
}, "invalid native review operation reference");
