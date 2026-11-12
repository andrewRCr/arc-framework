/** Markdownlint configuration discovery and structural selection validation. */

import { join } from "node:path";

import { parse, type ParseError } from "jsonc-parser";

import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownSelectionConfig } from "./selection.js";

/** The repository's supported markdownlint configuration form. */
export const ROOT_MARKDOWN_CONFIG_PATH = ".markdownlint-cli2.jsonc";

/** Dependencies for loading worktree Markdown configurations. */
export interface LoadWorktreeMarkdownConfigurationsOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readText: (path: string) => Promise<string>;
  /** Validated explicit paths whose ancestor configurations must be checked. */
  readonly markdownPaths?: readonly ManagedPath[];
}

const MARKDOWN_CONFIG_NAMES: readonly string[] = [
  ROOT_MARKDOWN_CONFIG_PATH,
  ".markdownlint-cli2.yaml", ".markdownlint-cli2.cjs", ".markdownlint-cli2.mjs",
  ".markdownlint.jsonc", ".markdownlint.json", ".markdownlint.yaml", ".markdownlint.yml",
  ".markdownlint.cjs", ".markdownlint.mjs",
];

/** Whether a repository-relative path is a configuration name recognized by markdownlint-cli2. */
export function isMarkdownConfigurationPath(path: string): boolean {
  return MARKDOWN_CONFIG_NAMES.includes(path.slice(path.lastIndexOf("/") + 1));
}

/** Enumerate every tracked filename recognized by markdownlint-cli2. */
export async function enumerateMarkdownConfigurationPaths(
  root: string,
  exec: GitExec,
  source: "worktree" | "index" = "worktree",
): Promise<readonly string[]> {
  const args = source === "index" ? ["ls-files", "--cached", "-z"] : ["ls-files", "-z"];
  const { stdout } = await exec("git", args, { cwd: root });
  return stdout.split("\0")
    .filter((path) => path !== "" && isMarkdownConfigurationPath(path));
}

/** Load supported worktree configs and require selector parity before linting. */
export async function loadWorktreeMarkdownConfigurations(
  options: LoadWorktreeMarkdownConfigurationsOptions,
): Promise<readonly string[]> {
  const paths = await enumerateMarkdownConfigurationPaths(options.root, options.exec);
  if (!paths.includes(ROOT_MARKDOWN_CONFIG_PATH)) {
    throw new ArcError("Root Markdown configuration is missing", "markdown.config-missing");
  }

  const ancestorContents = await readAncestorMarkdownConfigurations(options);
  for (const path of new Set([...paths, ...ancestorContents.keys()])) {
    if (!path.endsWith(ROOT_MARKDOWN_CONFIG_PATH)) {
      throw new ArcError(
        `Unsupported Markdown configuration form: ${path}; convert it to ${ROOT_MARKDOWN_CONFIG_PATH}`,
        "markdown.config-unsupported",
      );
    }
    const content = ancestorContents.get(path) ?? await options.readText(join(options.root, ...path.split("/")));
    const errors: ParseError[] = [];
    const candidate: unknown = parse(content, errors, { allowTrailingComma: false, disallowComments: false });
    if (errors.length > 0) {
      throw new ArcError(`Malformed Markdown configuration: ${path}`, "markdown.config-invalid");
    }
    const validation = validateMarkdownSelectionConfig(candidate, { root: path === ROOT_MARKDOWN_CONFIG_PATH });
    if (!validation.valid) {
      throw new ArcError(
        `${path}: ${validation.errors.join("; ")}`,
        "markdown.config-selection-drift",
      );
    }
  }
  return [...new Set([...paths, ...ancestorContents.keys()])];
}


async function readAncestorMarkdownConfigurations(
  options: LoadWorktreeMarkdownConfigurationsOptions,
): Promise<ReadonlyMap<string, string>> {
  const directories = new Set<string>();
  for (const path of options.markdownPaths ?? []) {
    const segments = path.split("/");
    for (let depth = 0; depth < segments.length; depth++) {
      directories.add(segments.slice(0, depth).join("/"));
    }
  }
  const contents = new Map<string, string>();
  for (const directory of directories) {
    for (const name of MARKDOWN_CONFIG_NAMES) {
      const path = directory === "" ? name : `${directory}/${name}`;
      try {
        contents.set(path, await options.readText(join(options.root, ...path.split("/"))));
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") continue;
        throw new ArcError(`Markdown configuration is unreadable: ${path}`, "markdown.config-unreadable", { cause: error });
      }
    }
  }
  return contents;
}
