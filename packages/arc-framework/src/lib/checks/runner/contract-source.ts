/** Portable source-artifact shapes shared by capture and adapter conversations. */
import { z } from "zod";
import { isWellFormedUnicode } from "../../kernel/canonical/unicode.js";
import { CanonicalDigestSchema } from "../../kernel/schema/vocabulary.js";

/** Code object names in either supported Git object format. */
export const GitObjectIdSchema = z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u);

const SourceTextSchema = z.string().min(1).refine(value => isWellFormedUnicode(value) && !value.includes("\0"));

/** Slash-separated root-relative names without traversal or implicit normalization. */
export const SourceRelativePathSchema = SourceTextSchema.refine(value => value.split("/")
  .every(component => component !== "" && component !== "." && component !== ".."));

/** Literal source-entry names outside generated Git administration. */
export const SourceEntryPathSchema = SourceRelativePathSchema.refine(value => !value.split("/").includes(".git"));

/** Code coordinates retained independently from raw materialized bytes. */
export const SourceCoordinatesSchema = z.strictObject({
  tree: GitObjectIdSchema, head: GitObjectIdSchema.optional(), base: GitObjectIdSchema.optional(), merged: z.array(GitObjectIdSchema),
});

const FileEntrySchema = z.strictObject({ path: SourceEntryPathSchema, kind: z.literal("file"), mode: z.int().min(0).max(0o7777),
  digest: CanonicalDigestSchema, bytes: z.int().nonnegative() });
const SymlinkEntrySchema = z.strictObject({ path: SourceEntryPathSchema, kind: z.literal("symlink"), target: SourceTextSchema });

/** One literal source file or symbolic link, excluding generated Git metadata. */
export const SourceManifestEntrySchema = z.discriminatedUnion("kind", [FileEntrySchema, SymlinkEntrySchema]);

/** Source presentation manifest supplied independently from captured project paths. */
export const SourceManifestSchema = z.strictObject({
  version: z.literal(1), coordinates: SourceCoordinatesSchema, entries: z.array(SourceManifestEntrySchema),
}).superRefine((manifest, context) => {
  let previous: string | undefined;
  for (const [index, entry] of manifest.entries.entries()) {
    if (previous !== undefined && Buffer.compare(Buffer.from(previous, "utf8"), Buffer.from(entry.path, "utf8")) >= 0) {
      context.addIssue({ code: "custom", path: ["entries", index, "path"], message: "Expected unique paths sorted by UTF-8 bytes" });
    }
    previous = entry.path;
  }
});

/** Independently verifiable code coordinates for a captured presentation. */
export type SourceCoordinates = z.infer<typeof SourceCoordinatesSchema>;
/** One source-manifest entry. */
export type SourceManifestEntry = z.infer<typeof SourceManifestEntrySchema>;
/** Canonical manifest data, independent of its caller-side artifact location. */
export type SourceManifest = z.infer<typeof SourceManifestSchema>;
