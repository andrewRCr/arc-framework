/** Runtime schemas for persisted and normalized local user sync state. */

import { z } from "zod";

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
/** Current normalized local sync-state record. */
export type LocalSyncState = z.infer<typeof LocalSyncStateSchema>;
/** Partial-push recovery marker. */
export type PartialPushMarker = z.infer<typeof PartialPushMarkerSchema>;
/** Captured materialized file list. */
export type PriorFileList = z.infer<typeof PriorFileListSchema>;
/** Per-worktree remote marker provenance map. */
export type RemoteMarkerProvenance = z.infer<typeof RemoteMarkerProvenanceSchema>;
