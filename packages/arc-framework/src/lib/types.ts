/**
 * Shared type definitions for the ARC CLI.
 *
 * Manifest schema, file entry metadata, and install configuration types
 * used across manifest I/O, init, update, and status commands.
 */

/** File classification determines update behavior during `arc update`. */
export type Classification = "Framework" | "Configurable" | "Scaffolded";

/** Layer determines which PM mode installs the file. */
export type Layer = "core" | "arc-in-git";

/** Per-file metadata tracked in the manifest. */
export interface FileEntry {
  classification: Classification;
  layer: Layer;
  pristine_hash: string;
}

/** Adopter's init configuration, stored in the manifest for re-rendering during updates. */
export interface InstallConfig {
  project_name: string;
  base_branch: string;
  pm_mode: string;
  team_mode: boolean;
  arc_dir: string;
  agents: string[];
}

/** Top-level manifest structure (`.arc-manifest.json`). */
export interface Manifest {
  framework_version: string;
  installed_at: string;
  install_config: InstallConfig;
  files: Record<string, FileEntry>;
}
