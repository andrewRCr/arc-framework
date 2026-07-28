/** Closed finalized version-3 decomposition receipt and continuation codec. */

import { z } from "zod";

import {
  canonicalDigest,
  canonicalize,
  isCanonicalDigest,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  V3DecomposePreparationFactsSchema,
  V3PathStateSchema,
  V3CandidatePublicationSchema,
  parseV3DecomposePreparation,
  type V3DecomposePreparation,
} from "./decompose-v3-preparation.js";

const DigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");
const DecomposeSlugSchema = SlugSchema.transform((value): string => value);
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);

export const V3DecomposeContinuationInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("selected"), slugs: z.array(DecomposeSlugSchema).min(1) }),
  z.strictObject({ kind: z.literal("none") }),
]);
const DestinationDigestSchema = z.strictObject({
  destinationId: z.string().refine((value) => value.trim() !== "", "must be non-empty"),
  digest: DigestSchema,
});
const DestinationOutputSchema = z.strictObject({
  path: ManagedPathSchema,
  after: V3PathStateSchema,
});
const DestinationOutputsSchema = z.strictObject({
  destinationId: DestinationDigestSchema.shape.destinationId,
  outputs: z.array(DestinationOutputSchema).min(1),
});
const ManagedPathResultSchema = z.strictObject({
  path: ManagedPathSchema,
  before: V3PathStateSchema,
  after: V3PathStateSchema,
});
const TransitionPatchEntrySchema = z.strictObject({
  path: ManagedPathSchema,
  before: V3PathStateSchema,
  after: V3PathStateSchema,
});
const PublicationSchema = V3CandidatePublicationSchema.extend({
  initialContinuation: V3DecomposeContinuationInputSchema,
});
export const V3DecomposeReceiptSchema = z.strictObject({
  kind: z.literal("decompose-receipt"),
  schemaVersion: z.literal(3),
  receiptId: DigestSchema,
  preparationId: DigestSchema,
  prepared: V3DecomposePreparationFactsSchema,
  finalized: z.strictObject({
    destinationDigests: z.array(DestinationDigestSchema),
    managedPathResults: z.array(ManagedPathResultSchema),
    transitionPatch: z.array(TransitionPatchEntrySchema),
    transitionPatchDigest: DigestSchema,
    publication: PublicationSchema,
  }),
});

export type V3DecomposeContinuationInput = z.infer<typeof V3DecomposeContinuationInputSchema>;
export type V3DecomposeReceipt = z.infer<typeof V3DecomposeReceiptSchema>;
export type V3ManagedPathResult = z.infer<typeof ManagedPathResultSchema>;
export type V3DestinationOutputs = z.infer<typeof DestinationOutputsSchema>;

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function ordered(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined && compareUtf8(previous, value) >= 0) return false;
    previous = value;
  }
  return true;
}

function statesEqual(
  left: V3ManagedPathResult["before"],
  right: V3ManagedPathResult["after"],
): boolean {
  return canonicalize(left) === canonicalize(right);
}

function receiptPath(receiptId: CanonicalDigest): string {
  return `.arc/system/.internal/retirement-receipts/${receiptId.replace(":", "-")}.json`;
}

/** Canonical mode-aware patch identity. */
export function v3TransitionPatchDigest(
  patch: readonly z.infer<typeof TransitionPatchEntrySchema>[],
): CanonicalDigest {
  return canonicalDigest(z.array(TransitionPatchEntrySchema).parse(patch));
}

/** Canonical digest for one destination's exact managed outputs. */
export function v3DestinationDigest(
  destinationId: string,
  outputs: ReadonlyArray<{ path: string; after: V3ManagedPathResult["after"] }>,
): CanonicalDigest | null {
  const parsed = DestinationOutputsSchema.safeParse({ destinationId, outputs });
  if (!parsed.success || !ordered(parsed.data.outputs.map(({ path }) => path))) return null;
  return canonicalDigest(parsed.data);
}

/**
 * Seal one finalized receipt from authenticated preparation and exact candidate outputs.
 *
 * @param preparationInput - Canonical prepared authority
 * @param managedPathResultsInput - Every non-receipt allowed path at result base and candidate
 * @param destinationOutputsInput - Exact path-sorted outputs for every destination
 * @param continuationInput - Ephemeral distribution choice
 * @returns Canonical finalized receipt, or `null`
 */
export function createV3DecomposeReceipt(
  preparationInput: unknown,
  managedPathResultsInput: unknown,
  destinationOutputsInput: unknown,
  continuationInput: unknown,
): V3DecomposeReceipt | null {
  const preparation = parseV3DecomposePreparation(preparationInput);
  const managedPathResults = z.array(ManagedPathResultSchema).safeParse(managedPathResultsInput);
  const destinationOutputs = z.array(DestinationOutputsSchema).safeParse(destinationOutputsInput);
  if (preparation === null || !managedPathResults.success || !destinationOutputs.success) return null;
  if (!ordered(managedPathResults.data.map(({ path }) => path))
    || !ordered(destinationOutputs.data.map(({ destinationId }) => destinationId))) return null;

  const continuation = parseV3DecomposeContinuationInput(
    continuationInput,
    preparation.facts.candidatePublication,
  );
  if (continuation === null) return null;
  const expectedDestinationIds = preparation.facts.completedMap.authoring.destinations
    .filter(({ kind }) => kind !== "cohort-coordination")
    .map(({ destinationId }) => destinationId);
  if (canonicalize(destinationOutputs.data.map(({ destinationId }) => destinationId))
    !== canonicalize(expectedDestinationIds)) return null;
  for (const destination of destinationOutputs.data) {
    if (!ordered(destination.outputs.map(({ path }) => path))
      || destination.outputs.some((output) => {
        const result = managedPathResults.data.find(({ path }) => path === output.path);
        return result === undefined || canonicalize(result.after) !== canonicalize(output.after);
      })) return null;
  }
  const transitionPatch = managedPathResults.data.filter(({ before, after }) =>
    !statesEqual(before, after));
  const destinationDigests = destinationOutputs.data.map(({ destinationId, outputs }) => {
    const digest = v3DestinationDigest(destinationId, outputs);
    return digest === null ? null : { destinationId, digest };
  });
  if (destinationDigests.some((entry) => entry === null)) return null;
  return parseV3DecomposeReceipt({
    kind: "decompose-receipt",
    schemaVersion: 3,
    receiptId: preparation.receiptId,
    preparationId: preparation.preparationId,
    prepared: preparation.facts,
    finalized: {
      destinationDigests,
      managedPathResults: managedPathResults.data,
      transitionPatch,
      transitionPatchDigest: v3TransitionPatchDigest(transitionPatch),
      publication: {
        ...preparation.facts.candidatePublication,
        initialContinuation: continuation,
      },
    },
  }, preparation);
}

/** Decode the closed ephemeral continuation choice against publication order. */
export function parseV3DecomposeContinuationInput(
  input: unknown,
  publication: unknown,
): V3DecomposeContinuationInput | null {
  const parsedPublication = V3CandidatePublicationSchema.safeParse(publication);
  if (!parsedPublication.success) return null;
  const parsed = V3DecomposeContinuationInputSchema.safeParse(input);
  if (!parsed.success) return null;
  if (parsed.data.kind === "none") return parsed.data;
  const candidateOrder = parsedPublication.data.entries
    .filter((entry): entry is Extract<typeof entry, { kind: "new-leaf" }> => entry.kind === "new-leaf")
    .map(({ slug }) => slug);
  const indexes = parsed.data.slugs.map((slug) => candidateOrder.indexOf(slug));
  let previous = -1;
  for (const index of indexes) {
    if (index < 0 || index <= previous) return null;
    previous = index;
  }
  return parsed.data;
}

/**
 * Decode and authenticate a finalized v3 receipt.
 *
 * @param input - Untrusted receipt value
 * @param preparation - Exact preparation whose facts must be sealed
 * @returns Authenticated receipt, or `null`
 */
export function parseV3DecomposeReceipt(
  input: unknown,
  preparation?: V3DecomposePreparation,
): V3DecomposeReceipt | null {
  let candidate = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
      if (canonicalize(candidate) !== input) return null;
    } catch {
      return null;
    }
  }
  const parsed = V3DecomposeReceiptSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const receipt = parsed.data;
  const embeddedPreparation = parseV3DecomposePreparation({
    kind: "prepared-decompose",
    schemaVersion: 3,
    receiptId: receipt.receiptId,
    preparationId: receipt.preparationId,
    facts: receipt.prepared,
  });
  if (embeddedPreparation === null
    || (preparation !== undefined
      && canonicalize(embeddedPreparation) !== canonicalize(preparation))) return null;
  const actualPublication = {
    logicalAnchor: receipt.finalized.publication.logicalAnchor,
    entries: receipt.finalized.publication.entries,
  };
  if (canonicalize(actualPublication) !== canonicalize(receipt.prepared.candidatePublication)
    || parseV3DecomposeContinuationInput(
      receipt.finalized.publication.initialContinuation,
      actualPublication,
    ) === null) return null;
  const expectedReceiptPath = receiptPath(receipt.receiptId);
  if (receipt.prepared.allowedPaths.filter((path) => path === expectedReceiptPath).length !== 1) return null;
  const allowed = receipt.prepared.allowedPaths.filter((path) => path !== expectedReceiptPath);
  const resultPaths = receipt.finalized.managedPathResults.map(({ path }) => path);
  const patchPaths = receipt.finalized.transitionPatch.map(({ path }) => path);
  const expectedDestinationIds = receipt.prepared.completedMap.authoring.destinations
    .filter(({ kind }) => kind !== "cohort-coordination")
    .map(({ destinationId }) => destinationId);
  if (!ordered(receipt.finalized.destinationDigests.map(({ destinationId }) => destinationId))
    || canonicalize(receipt.finalized.destinationDigests.map(({ destinationId }) => destinationId))
      !== canonicalize(expectedDestinationIds)
    || !ordered(resultPaths)
    || !ordered(patchPaths)
    || canonicalize(allowed) !== canonicalize(resultPaths)
    || receipt.finalized.managedPathResults.some(({ before, after }) =>
      before.kind === "file" && after.kind === "file" && before.mode !== after.mode)
    || receipt.finalized.managedPathResults.some((result) =>
      patchPaths.includes(result.path) === statesEqual(result.before, result.after))
    || receipt.finalized.transitionPatch.some((entry) =>
      statesEqual(entry.before, entry.after)
      || canonicalize(entry) !== canonicalize(
        receipt.finalized.managedPathResults.find(({ path }) => path === entry.path),
      ))
    || receipt.finalized.transitionPatchDigest !== v3TransitionPatchDigest(receipt.finalized.transitionPatch)) {
    return null;
  }
  return receipt;
}
