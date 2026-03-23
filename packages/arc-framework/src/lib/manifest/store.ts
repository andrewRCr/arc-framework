/**
 * Manifest I/O — schema validation, reading, and writing manifest.json.
 *
 * The manifest tracks the installed framework version, adopter's init
 * configuration, and per-file metadata (classification, layer, pristine hash).
 */

import type { Classification, Layer, Manifest } from "../types.js";

/** Read function signature for dependency injection. */
type ReadFileFn = (path: string) => Promise<string>;

const VALID_CLASSIFICATIONS: readonly Classification[] = [
  "Framework",
  "Configurable",
  "Scaffolded",
];
const VALID_LAYERS: readonly Layer[] = ["core", "arc-in-git"];

/** Result of manifest validation. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a manifest object against the expected schema.
 *
 * @param data - The object to validate
 * @returns Validation result with any errors found
 */
export function validateManifest(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Manifest must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.framework_version !== "string") {
    errors.push("Missing or invalid 'framework_version' (expected string)");
  }
  if (typeof obj.installed_at !== "string") {
    errors.push("Missing or invalid 'installed_at' (expected string)");
  }
  if (typeof obj.install_config !== "object" || obj.install_config === null) {
    errors.push("Missing or invalid 'install_config' (expected object)");
  } else {
    const ic = obj.install_config as Record<string, unknown>;
    if (typeof ic.project_name !== "string") {
      errors.push("install_config.project_name must be a string");
    }
    if (typeof ic.pm_mode !== "string") {
      errors.push("install_config.pm_mode must be a string");
    }
    if (!Array.isArray(ic.tools)) {
      errors.push("install_config.tools must be an array");
    }
  }
  if (typeof obj.files !== "object" || obj.files === null) {
    errors.push("Missing or invalid 'files' (expected object)");
  }

  // Validate file entries if files object exists
  if (typeof obj.files === "object" && obj.files !== null) {
    const files = obj.files as Record<string, unknown>;
    for (const [path, entry] of Object.entries(files)) {
      if (typeof entry !== "object" || entry === null) {
        errors.push(`File '${path}': expected object`);
        continue;
      }
      const fe = entry as Record<string, unknown>;

      if (
        typeof fe.classification !== "string" ||
        !VALID_CLASSIFICATIONS.includes(fe.classification as Classification)
      ) {
        errors.push(
          `File '${path}': invalid classification '${String(fe.classification)}' (expected ${VALID_CLASSIFICATIONS.join(", ")})`,
        );
      }
      if (
        typeof fe.layer !== "string" ||
        !VALID_LAYERS.includes(fe.layer as Layer)
      ) {
        errors.push(
          `File '${path}': invalid layer '${String(fe.layer)}' (expected ${VALID_LAYERS.join(", ")})`,
        );
      }
      if (typeof fe.pristine_hash !== "string") {
        errors.push(`File '${path}': missing or invalid 'pristine_hash'`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Read and parse a manifest from disk.
 *
 * @param path - Path to the manifest JSON file
 * @param readFile - Injectable read function for testability
 * @returns The parsed manifest, or null if the file doesn't exist
 * @throws Error if the file exists but contains malformed JSON
 */
export async function readManifest(
  path: string,
  readFile: ReadFileFn,
): Promise<Manifest | null> {
  let content: string;
  try {
    content = await readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw new Error(`Malformed JSON in manifest: ${path}`);
  }

  const result = validateManifest(parsed);
  if (!result.valid) {
    throw new Error(
      `Invalid manifest at ${path}:\n${result.errors.join("\n")}`,
    );
  }

  return parsed as Manifest;
}

