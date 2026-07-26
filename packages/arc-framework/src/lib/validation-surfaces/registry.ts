/** Internal schema discovery for durable validation-surface roots. */

import { MetaRecordSchema } from "../active/meta-schema.js";
import { ArcConfigSchema } from "../config/schema.js";
import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import { AuditEntrySchema } from "../release/schema.js";
import { PersistedLocalSyncStateSchema } from "../user-sync/schema.js";

/** Stable identities for registered durable validation-surface roots. */
export const VALIDATION_SURFACE_SCHEMA_IDS = {
  arcConfig: "arc-config",
  auditEntry: "audit-entry",
  localSyncState: "local-sync-state",
  metaRecord: "meta-record",
} as const;

const STRICT_CURRENT_V1 = {
  version: 1,
  migrationPosture: "strict-current",
} as const;

/**
 * Create a fresh kernel registry extended with durable validation surfaces.
 *
 * @returns Isolated registry containing kernel vocabulary and subsystem roots
 */
export function createValidationSurfacesRegistry(): KernelRegistry {
  const registry = createKernelRegistry();
  registry.register(ArcConfigSchema, {
    id: VALIDATION_SURFACE_SCHEMA_IDS.arcConfig,
    ...STRICT_CURRENT_V1,
  });
  registry.register(AuditEntrySchema, {
    id: VALIDATION_SURFACE_SCHEMA_IDS.auditEntry,
    version: 2,
    migrationPosture: "strict-current",
  });
  registry.register(PersistedLocalSyncStateSchema, {
    id: VALIDATION_SURFACE_SCHEMA_IDS.localSyncState,
    version: 4,
    migrationPosture: "backward-compatible",
  });
  registry.register(MetaRecordSchema, {
    id: VALIDATION_SURFACE_SCHEMA_IDS.metaRecord,
    ...STRICT_CURRENT_V1,
  });
  return registry;
}
