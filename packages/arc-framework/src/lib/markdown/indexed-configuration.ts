/** Exact-index markdownlint configuration loading and deterministic cascade resolution. */

import type { Configuration } from "markdownlint";
import { parse, type ParseError } from "jsonc-parser";

import type { GitExec } from "../git/index.js";
import { ArcError, validateManagedPath, type ManagedPath } from "../kernel/index.js";
import {
  enumerateMarkdownConfigurationPaths,
  ROOT_MARKDOWN_CONFIG_PATH,
} from "./configuration.js";
import type { ReadIndexedBlob } from "./indexed-snapshot.js";
import { validateMarkdownSelectionConfig } from "./selection.js";

/** One group of indexed Markdown paths sharing the same inherited rule configuration. */
export interface IndexedMarkdownConfigurationGroup {
  readonly config: Configuration;
  readonly paths: readonly ManagedPath[];
}

/** Loaded indexed configuration evidence and its effective Markdown groups. */
export interface IndexedMarkdownConfigurationResult {
  readonly configPaths: readonly ManagedPath[];
  readonly groups: readonly IndexedMarkdownConfigurationGroup[];
}

/** Inputs for exact-index configuration loading and path grouping. */
export interface LoadIndexedMarkdownConfigurationGroupsOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readBlob: ReadIndexedBlob;
  readonly markdownPaths: readonly string[];
}

interface ParsedConfiguration {
  readonly path: ManagedPath;
  readonly directory: string;
  readonly config: Configuration;
}

const ROOT_OPTIONS = new Set(["config", "customRules", "gitignore", "globs", "ignores"]);
const NESTED_OPTIONS = new Set(["config"]);

function configurationError(path: string, message: string, code: `markdown.${Lowercase<string>}`): ArcError {
  return new ArcError(`${path}: ${message}`, code);
}

function decodeConfiguration(path: ManagedPath, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Indexed Markdown configuration is not valid UTF-8: ${path}`, "markdown.config-invalid-utf8", {
      cause: error,
    });
  }
}

function objectValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfiguration(path: ManagedPath, bytes: Uint8Array): ParsedConfiguration {
  const errors: ParseError[] = [];
  const candidate: unknown = parse(
    decodeConfiguration(path, bytes),
    errors,
    { allowTrailingComma: false, disallowComments: false },
  );
  if (errors.length > 0 || !objectValue(candidate)) {
    throw configurationError(path, "Malformed Markdown configuration", "markdown.config-invalid");
  }

  const root = path === ROOT_MARKDOWN_CONFIG_PATH;
  const selection = validateMarkdownSelectionConfig(candidate, { root });
  if (!selection.valid) {
    throw configurationError(path, selection.errors.join("; "), "markdown.config-selection-drift");
  }
  const supported = root ? ROOT_OPTIONS : NESTED_OPTIONS;
  const unsupported = Object.keys(candidate).filter((option) => !supported.has(option));
  if (unsupported.length > 0) {
    throw configurationError(
      path,
      `Unsupported Markdown configuration option(s): ${unsupported.join(", ")}`,
      "markdown.config-option-unsupported",
    );
  }
  if (!objectValue(candidate.config)) {
    throw configurationError(path, "Markdown configuration config must be an object", "markdown.config-invalid");
  }
  if (Object.hasOwn(candidate.config, "extends")) {
    throw configurationError(path, "Markdown rule configuration must not extend external files", "markdown.config-option-unsupported");
  }
  if (root && (!Array.isArray(candidate.customRules) || candidate.customRules.length !== 0)) {
    throw configurationError(path, "customRules must be an empty array", "markdown.config-option-unsupported");
  }

  const slash = path.lastIndexOf("/");
  return {
    path,
    directory: slash === -1 ? "" : path.slice(0, slash),
    config: candidate.config,
  };
}

function isDirectoryAncestor(directory: string, path: ManagedPath): boolean {
  return directory === "" || path.startsWith(`${directory}/`);
}

function effectiveConfiguration(
  path: ManagedPath,
  configurations: readonly ParsedConfiguration[],
): Configuration {
  const effective: Record<string, unknown> = {};
  for (const configuration of configurations) {
    if (isDirectoryAncestor(configuration.directory, path)) {
      Object.assign(effective, configuration.config);
    }
  }
  return effective;
}

/**
 * Load every recognized indexed config once, validate the supported surface, and group Markdown paths.
 *
 * @param options - Exact-index boundaries and the already-selected Markdown path set
 * @returns Indexed configuration paths and deterministic effective-config groups
 */
export async function loadIndexedMarkdownConfigurationGroups(
  options: LoadIndexedMarkdownConfigurationGroupsOptions,
): Promise<IndexedMarkdownConfigurationResult> {
  const configPaths = (await enumerateMarkdownConfigurationPaths(options.root, options.exec, "index"))
    .map(validateManagedPath);
  if (!configPaths.includes(validateManagedPath(ROOT_MARKDOWN_CONFIG_PATH))) {
    throw new ArcError("Root Markdown configuration is missing", "markdown.config-missing");
  }
  const unsupported = configPaths.find((path) => !path.endsWith(ROOT_MARKDOWN_CONFIG_PATH));
  if (unsupported !== undefined) {
    throw new ArcError(
      `Unsupported Markdown configuration form: ${unsupported}; convert it to ${ROOT_MARKDOWN_CONFIG_PATH}`,
      "markdown.config-unsupported",
    );
  }

  const configurations = await Promise.all(configPaths.map(async (path) => {
    const bytes = await options.readBlob(options.root, path);
    if (bytes === null) {
      throw new ArcError(`Indexed Markdown configuration blob is missing: ${path}`, "markdown.config-missing");
    }
    return parseConfiguration(path, bytes);
  }));
  configurations.sort((left, right) =>
    left.directory.split("/").filter(Boolean).length - right.directory.split("/").filter(Boolean).length
    || left.path.localeCompare(right.path));

  const groups = new Map<string, { config: Configuration; paths: ManagedPath[] }>();
  for (const path of options.markdownPaths.map(validateManagedPath)) {
    const config = effectiveConfiguration(path, configurations);
    const key = JSON.stringify(config);
    const current = groups.get(key);
    if (current === undefined) groups.set(key, { config, paths: [path] });
    else current.paths.push(path);
  }
  return { configPaths, groups: [...groups.values()] };
}
