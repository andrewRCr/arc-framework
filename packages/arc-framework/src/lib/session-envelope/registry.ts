/**
 * Composed schema discovery for the session-init, recovery, and seed family.
 *
 * Registration records stable subsystem identities without publishing them to
 * the kernel JSON Schema bundle; build projection remains a separate concern.
 */

import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import { LoadSetManifestSchema } from "../load-set/types.js";
import { TaskListCursorSchema } from "../task-list/cursor.js";
import { TaskListCursorFileResultSchema } from "../task-list/file-cursor.js";

/** Stable identities for the currently registered session-envelope roots. */
export const SESSION_ENVELOPE_SCHEMA_IDS = {
  loadSetManifest: "load-set-manifest",
  taskListCursor: "task-list-cursor",
  taskListCursorFileResult: "task-list-cursor-file-result",
} as const;

const STRICT_CURRENT_V1 = {
  version: 1,
  migrationPosture: "strict-current",
} as const;

/**
 * Create a fresh kernel registry extended with session-envelope family roots.
 *
 * @returns Isolated registry containing kernel vocabulary and family schemas
 */
export function createSessionEnvelopeRegistry(): KernelRegistry {
  const registry = createKernelRegistry();
  registry.register(LoadSetManifestSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest,
    ...STRICT_CURRENT_V1,
  });
  registry.register(TaskListCursorSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.taskListCursor,
    ...STRICT_CURRENT_V1,
  });
  registry.register(TaskListCursorFileResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.taskListCursorFileResult,
    ...STRICT_CURRENT_V1,
  });
  return registry;
}
