/** Strict source and attestation binding for the opt-in local review lane. */

import { z } from "zod";

import {
  canonicalDigest,
  canonicalize,
  sortByCanonicalBytes,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import {
  ReviewAcceptedSourceSchema,
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
  type ReviewAcceptedSource,
} from "../core/gate-contract-v2-schema.js";

const SortedAcceptedSourcesSchema = z.array(ReviewAcceptedSourceSchema).min(1).refine((sources) => {
  const normalized = sortByCanonicalBytes(sources);
  return new Set(sources.map(canonicalize)).size === sources.length
    && normalized.every((source, index) => canonicalize(source) === canonicalize(sources[index]));
}, { message: "acceptable sources must be sorted and unique" });

const SortedRuntimeKindsSchema = z.array(ReviewIdentifierSchema).min(1).refine((values) => (
  new Set(values).size === values.length
  && [...values].sort().every((value, index) => value === values[index])
), { message: "runtime kinds must be sorted and unique" });

const LocalReviewPolicyBindingFieldsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("local-review-policy/v1"),
  acceptableSources: SortedAcceptedSourcesSchema,
  initialAdmission: z.enum(["automatic", "checkpoint"]),
  requestMechanism: z.literal("local-attestation"),
  acceptedRuntimeKinds: SortedRuntimeKindsSchema,
});

export const LocalReviewPolicyBindingDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.local-review.policy-binding-digest/v1"),
  ...LocalReviewPolicyBindingFieldsSchema.shape,
});

export const LocalReviewPolicyBindingSchema = z.strictObject({
  ...LocalReviewPolicyBindingFieldsSchema.shape,
  bindingDigest: ReviewCanonicalDigestSchema,
}).superRefine((binding, context) => {
  const fields = LocalReviewPolicyBindingFieldsSchema.parse({
    schemaVersion: binding.schemaVersion,
    semanticsVersion: binding.semanticsVersion,
    acceptableSources: binding.acceptableSources,
    initialAdmission: binding.initialAdmission,
    requestMechanism: binding.requestMechanism,
    acceptedRuntimeKinds: binding.acceptedRuntimeKinds,
  });
  const expected = canonicalDigest(LocalReviewPolicyBindingDigestPreimageSchema.parse({
    domain: "arc.local-review.policy-binding-digest/v1",
    ...fields,
  }));
  if (binding.bindingDigest !== expected) {
    context.addIssue({ code: "custom", message: "binding digest mismatch", path: ["bindingDigest"] });
  }
});
export type LocalReviewPolicyBinding = z.infer<typeof LocalReviewPolicyBindingSchema>;

/** Construct one canonical local policy binding and its semantic digest. */
export function createLocalReviewPolicyBinding(input: unknown): LocalReviewPolicyBinding {
  const fields = LocalReviewPolicyBindingFieldsSchema.parse(input);
  return LocalReviewPolicyBindingSchema.parse({
    ...fields,
    bindingDigest: canonicalDigest(LocalReviewPolicyBindingDigestPreimageSchema.parse({
      domain: "arc.local-review.policy-binding-digest/v1",
      ...fields,
    })),
  });
}

export const DEFAULT_LOCAL_REVIEW_POLICY_BINDING = Object.freeze(createLocalReviewPolicyBinding({
  schemaVersion: 1,
  semanticsVersion: "local-review-policy/v1",
  acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
  initialAdmission: "checkpoint",
  requestMechanism: "local-attestation",
  acceptedRuntimeKinds: ["arc-cli"],
}));

export type LocalReviewPolicyBindingResolution =
  | { status: "resolved"; binding: LocalReviewPolicyBinding; diagnostics: [] }
  | { status: "unavailable"; diagnostics: string[] };

/**
 * Resolve an optional project adapter without downgrading malformed declarations.
 *
 * @param adapter - Present project declaration reader, or null for package default.
 * @param registeredSources - Carrier sources registered in the production composition.
 * @returns A strict binding or unavailable diagnostics.
 */
export function resolveLocalReviewPolicyBinding(
  adapter: (() => unknown) | null,
  registeredSources: readonly ReviewAcceptedSource[],
): LocalReviewPolicyBindingResolution {
  if (adapter === null) {
    return { status: "resolved", binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING, diagnostics: [] };
  }
  let binding: LocalReviewPolicyBinding;
  try {
    binding = createLocalReviewPolicyBinding(adapter());
  } catch {
    return { status: "unavailable", diagnostics: ["local-policy.malformed-binding"] };
  }
  const registered = new Set(registeredSources.map(canonicalize));
  if (binding.acceptableSources.some((source) => !registered.has(canonicalize(source)))) {
    return { status: "unavailable", diagnostics: ["local-policy.unregistered-source"] };
  }
  return { status: "resolved", binding, diagnostics: [] };
}

/** Validate one selected source and installed runtime against the resolved binding. */
export function validateLocalReviewPolicySelection(
  bindingInput: LocalReviewPolicyBinding,
  selection: { source: ReviewAcceptedSource; runtimeKind: string },
): void {
  const binding = LocalReviewPolicyBindingSchema.parse(bindingInput);
  const source = ReviewAcceptedSourceSchema.parse(selection.source);
  if (!binding.acceptableSources.some((candidate) => canonicalize(candidate) === canonicalize(source))) {
    throw new Error("local review source is not accepted by policy");
  }
  const runtimeKind = ReviewIdentifierSchema.parse(selection.runtimeKind);
  if (!binding.acceptedRuntimeKinds.includes(runtimeKind)) {
    throw new Error("local review runtime is not accepted by policy");
  }
}

/** Register the local policy binding and its canonical digest preimage. */
export function registerLocalReviewPolicySchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(LocalReviewPolicyBindingDigestPreimageSchema, {
    id: "local-review-policy-binding-digest-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(LocalReviewPolicyBindingSchema, {
    id: "local-review-policy-binding",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
