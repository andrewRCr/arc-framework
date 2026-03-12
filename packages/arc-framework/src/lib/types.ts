/**
 * Shared type definitions for the ARC CLI.
 *
 * Manifest schema, file entry metadata, install configuration, and init
 * recipe types used across manifest I/O, init, update, and status commands.
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
  prompts: RecipePrompt[];
  conditions: Record<string, RecipeCondition>;
}
