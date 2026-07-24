/** Opaque command references that bind durable review records to their operation. */

import { z } from "zod";

import { ReviewIdentifierSchema } from "./gate-contract-v2-schema.js";

const DurableReferenceSchema = z.string().trim().min(1);
const PREFIX = "arc-review-source:v1:";

export type BoundReviewSourceReference = {
  kind: "attested-local" | "frontline";
  operationId: string;
  durableRef: string;
};

/** Bind an exact durable record reference to the operation that owns it. */
export function bindReviewSourceReference(input: BoundReviewSourceReference): string {
  const operationId = ReviewIdentifierSchema.parse(input.operationId);
  const durableRef = DurableReferenceSchema.parse(input.durableRef);
  return `${PREFIX}${input.kind}:${encodeURIComponent(operationId)}:${encodeURIComponent(durableRef)}`;
}

/** Decode one command-owned source reference without trusting either embedded coordinate. */
export function parseReviewSourceReference(
  reference: string,
  expectedKind: BoundReviewSourceReference["kind"],
): BoundReviewSourceReference {
  const value = DurableReferenceSchema.parse(reference);
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
