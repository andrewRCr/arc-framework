/** Opaque command references that bind durable review records to their operation. */

import { z } from "zod";

import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";
import { NativeReviewOperationReferenceSchema } from "./review-operation-reference.js";

const DurableReferenceSchema = z.string().trim().min(1);
const PREFIX = "arc-review-source:v1:";

const NATIVE_PREFIX = "arc-review-source:v2:";

/** Portable result coordinates retain their selected owner outside every stable identifier. */
export const NativeReviewSourceReferenceSchema = NativeReviewOperationReferenceSchema.extend({
  kind: z.enum(["attested-local", "frontline", "hosted"]),
  durableRef: DurableReferenceSchema,
});
export type NativeReviewSourceReference = z.infer<typeof NativeReviewSourceReferenceSchema>;

export type BoundReviewSourceReference = NativeReviewSourceReference | {
  kind: "attested-local" | "frontline" | "hosted";
  operationId: string;
  durableRef: string;
};

/** Bind an exact durable record reference to the operation that owns it. */
export function bindReviewSourceReference(input: BoundReviewSourceReference): string {
  if ("repositoryId" in input || "workItem" in input) {
    return `${NATIVE_PREFIX}${encodeURIComponent(JSON.stringify(NativeReviewSourceReferenceSchema.parse(input)))}`;
  }
  const operationId = ReviewIdentifierSchema.parse(input.operationId);
  const durableRef = DurableReferenceSchema.parse(input.durableRef);
  return `${PREFIX}${input.kind}:${encodeURIComponent(operationId)}:${encodeURIComponent(durableRef)}`;
}

/**
 * Decode one command-owned source reference without trusting its embedded coordinates.
 * @param native - The caller selected the native review composition; repository readers keep the default codec.
 */
export function parseReviewSourceReference(
  reference: string,
  expectedKind: BoundReviewSourceReference["kind"],
  native = false,
): BoundReviewSourceReference {
  const value = DurableReferenceSchema.parse(reference);
  if (native && value.startsWith(NATIVE_PREFIX)) {
    const parsed = NativeReviewSourceReferenceSchema.parse(
      JSON.parse(decodeURIComponent(value.slice(NATIVE_PREFIX.length))) as unknown,
    );
    if (parsed.kind !== expectedKind) throw new Error("review source reference kind mismatch");
    return parsed;
  }
  const prefix = `${PREFIX}${expectedKind}:`;
  if (!value.startsWith(prefix)) throw new Error("review source reference kind mismatch");
  const encoded = value.slice(prefix.length);
  const separator = encoded.indexOf(":");
  if (separator <= 0 || separator === encoded.length - 1) {
    throw new Error("malformed review source reference");
  }
  let operationId: string;
  let durableRef: string;
  try {
    operationId = decodeURIComponent(encoded.slice(0, separator));
    durableRef = decodeURIComponent(encoded.slice(separator + 1));
  } catch {
    throw new Error("malformed review source reference");
  }
  return {
    kind: expectedKind,
    operationId: ReviewIdentifierSchema.parse(operationId),
    durableRef: DurableReferenceSchema.parse(durableRef),
  };
}
