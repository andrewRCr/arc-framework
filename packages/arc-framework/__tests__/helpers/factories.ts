/**
 * Shared test data factories for unit and integration tests.
 *
 * Provides overridable builders for common ARC data structures.
 * Static data lives here; test utilities and I/O helpers live in integration.ts.
 */

import type { Manifest, FileEntry, Classification, Layer } from "../../src/lib/types.js";

/**
 * Build a valid Manifest with sensible defaults. Override any field.
 */
export function buildManifest(
  overrides: Partial<Manifest> & { files?: Manifest["files"] } = {},
): Manifest {
  return {
    framework_version: "1.0.0",
    installed_at: "2026-01-01T00:00:00.000Z",
    install_config: {
      project_name: "Test Project",
      pm_mode: "none",
      tools: [],
    },
    files: {},
    ...overrides,
  };
}

/**
 * Build a FileEntry with defaults.
 */
export function buildFileEntry(
  overrides: Partial<FileEntry> = {},
): FileEntry {
  return {
    classification: "Framework" as Classification,
    layer: "core" as Layer,
    pristine_hash: "abc123",
    ...overrides,
  };
}
