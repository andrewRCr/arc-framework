/** Markdownlint configuration discovery and structural selection validation. */

import { join } from "node:path";

import { parse, type ParseError } from "jsonc-parser";

import type { GitExec } from "../git/index.js";
import { ArcError } from "../kernel/index.js";
import { validateMarkdownSelectionConfig } from "./selection.js";

/** The repository's supported markdownlint configuration form. */
export const ROOT_MARKDOWN_CONFIG_PATH = ".markdownlint-cli2.jsonc";

/** Dependencies for loading worktree Markdown configurations. */
export interface LoadWorktreeMarkdownConfigurationsOptions {
  readonly root: string;
  readonly exec: GitExec;
  readonly readText: (path: string) => Promise<string>;
}

const MARKDOWN_CONFIG_RE = /(?:^|\/)\.(?:markdownlint-cli2\.(?:jsonc|yaml|cjs|mjs)|markdownlint\.(?:jsonc|json|yaml|yml|cjs|mjs))$/u;

/** Enumerate every tracked filename recognized by markdownlint-cli2. */
export async function enumerateMarkdownConfigurationPaths(
  root: string,
  exec: GitExec,
): Promise<readonly string[]> {
  const { stdout } = await exec("git", ["ls-files", "-z"], { cwd: root });
  return stdout.split("\0")
    .filter((path) => path !== "" && MARKDOWN_CONFIG_RE.test(path));
}

/** Load supported worktree configs and require selector parity before linting. */
export async function loadWorktreeMarkdownConfigurations(
  options: LoadWorktreeMarkdownConfigurationsOptions,
): Promise<readonly string[]> {
  const paths = await enumerateMarkdownConfigurationPaths(options.root, options.exec);
  if (!paths.includes(ROOT_MARKDOWN_CONFIG_PATH)) {
    throw new ArcError("Root Markdown configuration is missing", "markdown.config-missing");
  }

  for (const path of paths) {
    if (!path.endsWith(ROOT_MARKDOWN_CONFIG_PATH)) {
      throw new ArcError(
        `Unsupported Markdown configuration form: ${path}; convert it to ${ROOT_MARKDOWN_CONFIG_PATH}`,
        "markdown.config-unsupported",
      );
    }
    const content = await options.readText(join(options.root, ...path.split("/")));
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
  return paths;
}
