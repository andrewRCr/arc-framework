/** Canonical executable-source and response authority identity captured before redaction. */
import { canonicalDigest, type CanonicalDigest } from "../../../lib/kernel/index.js";
import type { BoundFrontlineResponseBinding } from "./frontline-response-binding.js";
import { FrontlineSourceDescriptorSchema, type FrontlineSourceDescriptor } from "../policy/frontline-source.js";

/**
 * Bind the executable source and optional Candidate/member response authority as one identity.
 *
 * @param sourceInput - The normalized frontline source selected for the run.
 * @param responseBinding - Candidate/member authority retained by pre-publication, when present.
 * @returns The canonical source-binding digest used by operation state and response validation.
 */
export function computeFrontlineSourceBindingId(
  sourceInput: FrontlineSourceDescriptor,
  responseBinding?: BoundFrontlineResponseBinding,
): CanonicalDigest {
  const source = FrontlineSourceDescriptorSchema.parse(sourceInput);
  return canonicalDigest(responseBinding === undefined
    ? {
        domain: "arc.review-gate.frontline-source-binding/v1",
        source,
      }
    : {
        domain: "arc.review-gate.frontline-source-binding/v1",
        source,
        responseBinding,
      });
}
