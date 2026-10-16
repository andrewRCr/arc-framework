/** Canonical, strictly parsed metadata for each state ref or archive folder. */

import { z } from "zod";
import { SlugSchema, ArchiveQuarterSchema } from "../../kernel/index.js";
import { canonicalize } from "../../kernel/canonical/canonical-json.js";
import { WritePlacementSchema } from "../placement.js";
import { LinksSchema } from "../links.js";
import type { Remedy } from "../refusal.js";
import type { BatchObject } from "./batch-read.js";

/** The supported metadata format, including retained primary facts and lineage names. */
export const RefMetadataSchema = z.strictObject({
  formatVersion: z.literal(1), slug: SlugSchema.optional(), formerSlugs: z.array(SlugSchema).optional(),
  primary: z.strictObject({ role: z.enum(["work-item/meta", "work-item/record"]), placement: WritePlacementSchema,
    links: LinksSchema.optional() }).optional(),
  placement: z.strictObject({ kind: z.literal("completed"), quarter: ArchiveQuarterSchema }).optional(),
  lineage: z.record(z.uuid(), SlugSchema).optional(), endBatch: z.string().optional(), batch: z.string().optional(),
  formats: z.record(z.string(), z.number().int().positive()),
});
/** Metadata decoded from its canonical JSON value. */
export type RefMetadata = z.infer<typeof RefMetadataSchema>;

/** Establish usable metadata without assigning the caller's failure outcome. */
export function parseRefMetadata(object: BatchObject | null | undefined, namespace?: string): RefMetadata | null {
  if (object?.type !== "blob") return null;
  try {
    const canonical = canonicalize(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(object.bytes)));
    const parsed = RefMetadataSchema.safeParse(JSON.parse(canonical));
    if (!parsed.success) return null;
    if (namespace && /^refs\/arc\/(?:work|cohort)\//u.test(namespace) && !parsed.data.slug) return null;
    return parsed.data;
  } catch { return null; }
}

/** Describe the observed metadata condition and a forward-only repair route. */
export function metadataFailure(namespace: string): { condition: string; remedy: Remedy } {
  return { condition: `Metadata on ${namespace} is missing or cannot be parsed`, remedy: {
    text: `Repair ${namespace} forward: commit its metadata file from the last parsing tip on top of its current tip in the store repository, then retry.`,
  } };
}
