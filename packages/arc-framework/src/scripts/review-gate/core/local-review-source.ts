/** Immutable Git-object-range source descriptor for local advisory review. */

import { z } from "zod";
import { CanonicalDigestSchema } from "../../../lib/kernel/schema/vocabulary.js";

import {
  canonicalDigest,
  type KernelRegistry,
} from "../../../lib/kernel/index.js";
import { IncrementalReviewScopeSchema } from "./incremental-review-scope.js";

const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);
const OpaqueReferenceSchema = z.string().trim().min(1);

const LocalReviewSourceSemanticFieldsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  semanticsVersion: z.literal("git-object-range/v1"),
  repositoryId: IdentifierSchema,
  targetId: CanonicalDigestSchema,
  objectFormat: z.enum(["sha1", "sha256"]),
  diffBaseSha: GitObjectIdSchema,
  diffBaseTree: GitObjectIdSchema,
  headSha: GitObjectIdSchema,
  headTree: GitObjectIdSchema,
  correctionScope: IncrementalReviewScopeSchema.optional(),
}).superRefine((source, context) => {
  const width = source.objectFormat === "sha1" ? 40 : 64;
  for (const field of ["diffBaseSha", "diffBaseTree", "headSha", "headTree"] as const) {
    if (source[field].length !== width) {
      context.addIssue({
        code: "custom",
        message: `object id does not match ${source.objectFormat} object format`,
        path: [field],
      });
    }
  }
  if (source.correctionScope !== undefined) {
    for (const [field, objectId] of [
      ["predecessorHeadSha", source.correctionScope.predecessorHeadSha],
      ["basisHeadSha", source.correctionScope.basisHeadSha],
    ] as const) {
      if (objectId.length !== width) {
        context.addIssue({
          code: "custom",
          message: `object id does not match ${source.objectFormat} object format`,
          path: ["correctionScope", field],
        });
      }
    }
    if (source.correctionScope.headSha !== source.headSha) {
      context.addIssue({
        code: "custom",
        message: "correction scope must end at the source head",
        path: ["correctionScope", "headSha"],
      });
    }
  }
});

export const LocalReviewSourceDigestPreimageSchema = z.strictObject({
  domain: z.literal("arc.local-review.source-digest/v1"),
  ...LocalReviewSourceSemanticFieldsSchema.shape,
});
export type LocalReviewSourceDigestPreimage = z.infer<typeof LocalReviewSourceDigestPreimageSchema>;

const LocalReviewSourceInputSchema = z.strictObject({
  ...LocalReviewSourceSemanticFieldsSchema.shape,
  reachabilityRef: OpaqueReferenceSchema,
  predecessorReachabilityRef: OpaqueReferenceSchema.optional(),
  basisReachabilityRef: OpaqueReferenceSchema.optional(),
  materializationRef: OpaqueReferenceSchema,
});
const LocalReviewSourceObjectSchema = z.strictObject({
  ...LocalReviewSourceInputSchema.shape,
  sourceDigest: CanonicalDigestSchema,
});

export const LocalReviewSourceSchema = LocalReviewSourceObjectSchema.superRefine((source, context) => {
  const semantic = LocalReviewSourceSemanticFieldsSchema.safeParse(semanticFieldsFrom(source));
  if (!semantic.success) {
    for (const issue of semantic.error.issues) {
      context.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
    return;
  }
  if (source.sourceDigest !== computeLocalReviewSourceDigest(semantic.data)) {
    context.addIssue({
      code: "custom",
      message: "sourceDigest must bind the semantic Git object range",
      path: ["sourceDigest"],
    });
  }
  const hasScope = source.correctionScope !== undefined;
  if (hasScope !== (source.predecessorReachabilityRef !== undefined)
    || hasScope !== (source.basisReachabilityRef !== undefined)) {
    context.addIssue({
      code: "custom",
      message: "correction scope and its operation-owned reachability refs must be carried together",
      path: ["correctionScope"],
    });
  }
});
export type LocalReviewSource = z.infer<typeof LocalReviewSourceSchema>;

/** Compute the domain-separated digest without operational locator fields. */
export function computeLocalReviewSourceDigest(
  semanticFields: z.input<typeof LocalReviewSourceSemanticFieldsSchema>,
): `sha256:${string}` {
  const fields = LocalReviewSourceSemanticFieldsSchema.parse(semanticFields);
  return canonicalDigest(LocalReviewSourceDigestPreimageSchema.parse({
    domain: "arc.local-review.source-digest/v1",
    ...fields,
  }));
}

/** Create and validate one immutable local-review source descriptor. */
export function createLocalReviewSource(
  input: z.input<typeof LocalReviewSourceInputSchema>,
): LocalReviewSource {
  const fields = LocalReviewSourceInputSchema.parse(input);
  const semantic = LocalReviewSourceSemanticFieldsSchema.parse(semanticFieldsFrom(fields));
  return LocalReviewSourceSchema.parse({
    ...fields,
    sourceDigest: computeLocalReviewSourceDigest(semantic),
  });
}

function semanticFieldsFrom(source: z.input<typeof LocalReviewSourceSemanticFieldsSchema>) {
  return {
    schemaVersion: source.schemaVersion,
    semanticsVersion: source.semanticsVersion,
    repositoryId: source.repositoryId,
    targetId: source.targetId,
    objectFormat: source.objectFormat,
    diffBaseSha: source.diffBaseSha,
    diffBaseTree: source.diffBaseTree,
    headSha: source.headSha,
    headTree: source.headTree,
    ...(source.correctionScope === undefined ? {} : { correctionScope: source.correctionScope }),
  };
}

/** Register the descriptor and its semantic digest preimage. */
export function registerLocalReviewSourceSchemas(registry: KernelRegistry): KernelRegistry {
  registry.register(LocalReviewSourceDigestPreimageSchema, {
    id: "local-review-source-digest-preimage",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(LocalReviewSourceSchema, {
    id: "local-review-source",
    version: 1,
    migrationPosture: "strict-current",
  });
  return registry;
}
