/** Runtime schemas for persisted and normalized local user sync state. */

import { z } from "zod";

/** Strict cross-work-unit entry preserved for identity merge and reconstruction. */
export const CrossWuEntrySchema = z.strictObject({
  section: z.enum(["Memories", "Errand", "Work Unit"]),
  key: z.string().min(1),
  raw: z.string().min(1),
});

/** Strict no-throw parse outcome for one cross-work-unit entry block. */
export const CrossWuEntryParseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), entry: CrossWuEntrySchema }),
  z.strictObject({ ok: z.literal(false), reason: z.string().min(1) }),
]);

const RequiredLocalSyncStateShape = {
  materializedManifestHash: z.string().min(1),
  sourceCommit: z.string().min(1),
  sourceOperation: z.enum(["save", "load"]),
} as const;

const PersistedExtensionShape = {
  savedAt: z.unknown().optional(),
  verifiedAt: z.unknown().optional(),
  notesRefTip: z.unknown().optional(),
  partialPush: z.unknown().optional(),
  partialPushErrand: z.unknown().optional(),
  priorFileList: z.unknown().optional(),
  remoteMarkerProvenance: z.unknown().optional(),
} as const;

/** Strict partial-push recovery marker retained in normalized local state. */
export const PartialPushMarkerSchema = z.strictObject({
  localRefHash: z.string().min(1),
  sourceCommit: z.string().min(1),
});

/** String-array file-list extension retained in normalized local state. */
export const PriorFileListSchema = z.array(z.string());

/** Object-map provenance extension retained in normalized local state. */
export const RemoteMarkerProvenanceSchema = z.record(z.string(), z.unknown());
const NonEmptyPersistedStringSchema = z.string().min(1);

/** Backward-compatible persisted reader for local sync-state versions 2–4. */
export const PersistedLocalSyncStateSchema = z.union([
  z.looseObject({
    version: z.literal(2),
    ...RequiredLocalSyncStateShape,
    ...PersistedExtensionShape,
  }),
  z.looseObject({
    version: z.literal(3),
    ...RequiredLocalSyncStateShape,
    ...PersistedExtensionShape,
  }),
  z.looseObject({
    version: z.literal(4),
    ...RequiredLocalSyncStateShape,
    ...PersistedExtensionShape,
  }),
]);

/** Strict normalized version-4 record accepted from current producers. */
export const LocalSyncStateSchema = z.strictObject({
  version: z.literal(4),
  ...RequiredLocalSyncStateShape,
  savedAt: z.string().min(1).optional(),
  verifiedAt: z.string().min(1).optional(),
  notesRefTip: z.string().min(1).optional(),
  partialPush: PartialPushMarkerSchema.optional(),
  partialPushErrand: PartialPushMarkerSchema.optional(),
  priorFileList: PriorFileListSchema.optional(),
  remoteMarkerProvenance: RemoteMarkerProvenanceSchema.optional(),
});

/** Persisted versions accepted at the backward-compatible reader boundary. */
export type PersistedLocalSyncState = z.infer<typeof PersistedLocalSyncStateSchema>;
/** Cross-work-unit entry preserved for identity merge and reconstruction. */
export type CrossWuEntry = z.infer<typeof CrossWuEntrySchema>;
/** No-throw parse outcome for one cross-work-unit entry block. */
export type EntryParse = z.infer<typeof CrossWuEntryParseSchema>;
/** Current normalized local sync-state record. */
export type LocalSyncState = z.infer<typeof LocalSyncStateSchema>;
/** Partial-push recovery marker. */
export type PartialPushMarker = z.infer<typeof PartialPushMarkerSchema>;
/** Captured materialized file list. */
export type PriorFileList = z.infer<typeof PriorFileListSchema>;
/** Per-worktree remote marker provenance map. */
export type RemoteMarkerProvenance = z.infer<typeof RemoteMarkerProvenanceSchema>;

function normalizedExtension<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

/**
 * Normalize a structurally valid persisted record to strict version 4.
 *
 * @param persisted - Parsed persisted sync state with tolerant extension slots
 * @returns Strict current state containing only independently valid known extensions
 */
export function normalizeLocalSyncState(persisted: PersistedLocalSyncState): LocalSyncState {
  const savedAt = normalizedExtension(NonEmptyPersistedStringSchema, persisted.savedAt);
  const verifiedAt = normalizedExtension(NonEmptyPersistedStringSchema, persisted.verifiedAt);
  const notesRefTip = normalizedExtension(NonEmptyPersistedStringSchema, persisted.notesRefTip);
  const partialPush = normalizedExtension(PartialPushMarkerSchema, persisted.partialPush);
  const partialPushErrand = normalizedExtension(PartialPushMarkerSchema, persisted.partialPushErrand);
  const priorFileList = normalizedExtension(PriorFileListSchema, persisted.priorFileList);
  const remoteMarkerProvenance = normalizedExtension(
    RemoteMarkerProvenanceSchema,
    persisted.remoteMarkerProvenance,
  );

  return LocalSyncStateSchema.parse({
    version: 4,
    materializedManifestHash: persisted.materializedManifestHash,
    sourceCommit: persisted.sourceCommit,
    sourceOperation: persisted.sourceOperation,
    ...(savedAt === undefined ? {} : { savedAt }),
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
    ...(notesRefTip === undefined ? {} : { notesRefTip }),
    ...(partialPush === undefined ? {} : { partialPush }),
    ...(partialPushErrand === undefined ? {} : { partialPushErrand }),
    ...(priorFileList === undefined ? {} : { priorFileList }),
    ...(remoteMarkerProvenance === undefined ? {} : { remoteMarkerProvenance }),
  });
}
