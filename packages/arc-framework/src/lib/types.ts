/**
 * Shared type definitions for the ARC CLI.
 *
 * Manifest schema, file entry metadata, install configuration, and init
 * recipe types used across manifest I/O, init, update, and status commands.
 */

import type { ReadFileFn, WriteFileFn, MkdirFn } from "./template/index.js";
import type { GitExec } from "./git/index.js";

// --- Core I/O ---

/** Read-only I/O — the minimal set shared by all commands. */
export interface ReadIO {
  readFile: ReadFileFn;
}

/** Full I/O for commands that write files and run git. */
export interface CoreIO extends ReadIO {
  writeFile: WriteFileFn;
  mkdir: MkdirFn;
  exec: GitExec;
}

// --- Manifest and File Metadata ---

/** File classification determines update behavior during `arc update`. */
export type Classification = "Framework" | "Configurable" | "Scaffolded";

/** Layer determines which PM mode installs the file. */
export type Layer = "core" | "arc-in-git";

/** Per-file metadata tracked in the manifest. */
export interface FileEntry {
  classification: Classification;
  layer: Layer;
  /** SHA-256 of pristine content. Omitted for Scaffolded files (adopter-owned, no baseline). */
  pristine_hash?: string;
}

/** Adopter's init configuration, stored in the manifest for re-rendering during updates. */
export interface InstallConfig {
  project_name: string;
  pm_mode: string;
  tools: string[];
  team_mode?: boolean;
  /**
   * Absolute path to the repo root at the time of the last install/update/reconfigure.
   * Populated by init.ts, update.ts, and reconfigure.ts. Optional for back-compat
   * with manifests written before this field was introduced.
   */
  repo_root?: string;
}

/** Top-level manifest structure (`.arc/system/.internal/manifest.json`). */
export interface Manifest {
  schema_version: number;
  framework_version: string;
  installed_at: string;
  install_config: InstallConfig;
  files: Record<string, FileEntry>;
}

// --- Init Recipe Types ---

/** Prompt types supported by the init recipe, matching @clack/prompts capabilities. */
export type PromptType = "text" | "select" | "multiselect" | "confirm";

/** A single prompt definition in the init recipe. */
export interface RecipePrompt {
  id: string;
  type: PromptType;
  message: string;
  default?: string | boolean | string[];
  options?: string[];
  token?: string;
  config_key?: string;
}

/** A condition-triggered file set in the init recipe. */
export interface RecipeCondition {
  include_files: string[];
}

/** Declarative init recipe — maps prompts to tokens, conditions to file sets. */
export interface Recipe {
  /** Files included unconditionally in every init (relative to template root). */
  include_files?: string[];
  /** Tokens computed at init time (not from prompts). Key = token name, value = description. */
  computed_tokens?: Record<string, string>;
  prompts: RecipePrompt[];
  conditions: Record<string, RecipeCondition>;
}
