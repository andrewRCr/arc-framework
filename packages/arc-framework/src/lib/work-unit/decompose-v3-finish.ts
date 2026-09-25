/** Typed outcome contract for previewing or applying extraction source finish. */

import { z } from "zod";

import { isCanonicalDigest } from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { V3DecomposeCoreRefusalSchema } from "./decompose-v3-refusal.js";
import { V3DecomposeLocatorSchema } from "./decompose-v3-schema.js";

const GitObjectIdSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u);
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);
const ModeSchema = z.enum(["100644", "100755"]);
const DigestSchema = z.string().refine(isCanonicalDigest, "must be a canonical digest");
const Base64Schema = z.string().refine(
  (value) => Buffer.from(value, "base64").toString("base64") === value,
  "must be canonical base64",
);

/** Exact source mutations and live-base destination facts bound into apply authority. */
export const V3ExtractionFinishEvidenceSchema = z.strictObject({
  liveBase: z.strictObject({
    ref: z.string().min(1),
    head: GitObjectIdSchema,
    destinations: z.array(z.strictObject({
      path: ManagedPathSchema,
      mode: ModeSchema,
      contentDigest: DigestSchema,
    })).min(1),
  }),
  sources: z.array(z.strictObject({
    path: ManagedPathSchema,
    before: z.strictObject({
      mode: ModeSchema,
      contentDigest: DigestSchema,
      byteLength: z.number().int().nonnegative(),
    }),
    after: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("absent") }),
      z.strictObject({
        kind: z.literal("file"),
        mode: ModeSchema,
        contentBase64: Base64Schema,
      }),
    ]),
    removedLocators: z.array(V3DecomposeLocatorSchema),
  })).min(1),
});

/** Exact evidence packet shown before apply, with its stateless consumption identity. */
export const V3ExtractionFinishPreviewSchema = V3ExtractionFinishEvidenceSchema.extend({
  applyAuthority: DigestSchema,
});

/** Exact finish evidence before its canonical authority is attached. */
export type V3ExtractionFinishEvidence = z.infer<typeof V3ExtractionFinishEvidenceSchema>;

/** Exact evidence packet returned by a successful finish preview. */
export type V3ExtractionFinishPreview = z.infer<typeof V3ExtractionFinishPreviewSchema>;

/** Closed result shared by finish preview, application, and recovery. */
export const V3ExtractionFinishResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("previewed"),
    preview: V3ExtractionFinishPreviewSchema,
  }),
  z.strictObject({ status: z.literal("finished") }),
  z.strictObject({ status: z.literal("already-finished") }),
  V3DecomposeCoreRefusalSchema,
]);

/** Canonical machine result emitted by the extraction finish command. */
export type V3ExtractionFinishResult = z.infer<typeof V3ExtractionFinishResultSchema>;
