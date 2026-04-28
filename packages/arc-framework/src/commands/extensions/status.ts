/**
 * Extensions-status probe implementations.
 *
 * Two entry points:
 *
 * - {@link runExtensionsStatus} — full state for default rendering and
 *   `--all` (includes the orphan detail list).
 * - {@link runExtensionsSessionInitStatus} — narrow active-extensions list
 *   for session-init. Skips the workflow scan since session-init only
 *   needs the list of active names.
 *
 * Both read directly from `fs/promises`; integration tests exercise the
 * fs side against fixture trees, and unit tests cover the scanners and
 * formatter with synthetic data.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { walkMarkdown } from "../../lib/fs/walk-markdown.js";
import { parseExtensionFrontmatter } from "../../lib/frontmatter/index.js";
import { classifyExtensionRefs } from "../../lib/extensions/orphan-detector.js";
import { scanExtensionPoints, type ScanInput } from "../../lib/extensions/point-scanner.js";
import type {
  ExtensionsSessionInitOptions,
  ExtensionsSessionInitResult,
  ExtensionsStatusOptions,
  ExtensionsStatusResult,
  ExtensionSummary,
} from "./types.js";

/** Locate the extensions directory inside an ARC install. */
function extensionsDir(cwd: string): string {
  return join(cwd, ".arc", "system", "extensions");
}

/** Locate the workflows directory inside an ARC install. */
function workflowsDir(cwd: string): string {
  return join(cwd, ".arc", "system", "workflows");
}

/** Outcome of the extensions-directory scan. */
interface DirectoryScan {
  extensions: ExtensionSummary[];
  /** Names used by the orphan detector — includes basenames even for malformed files. */
  knownNames: string[];
  warnings: string[];
}

async function readExtensionsDirectory(dir: string): Promise<DirectoryScan> {
  const entries = await readdir(dir);
  const mdFiles = entries.filter((f) => f.endsWith(".md") && f !== "README.md").sort();

  const extensions: ExtensionSummary[] = [];
  const knownNames: string[] = [];
  const warnings: string[] = [];

  for (const filename of mdFiles) {
    const basename = filename.slice(0, -3);
    const content = await readFile(join(dir, filename), "utf8");
    const parsed = parseExtensionFrontmatter(content, basename);
    if (parsed.frontmatter) {
      extensions.push({
        name: parsed.frontmatter.name,
        active: parsed.frontmatter.active,
        description: parsed.frontmatter.description,
      });
      knownNames.push(parsed.frontmatter.name);
    } else {
      warnings.push(`${filename}: ${parsed.errors.join("; ")}`);
      // Include the basename so references to it still resolve — a parse
      // failure shouldn't cascade into orphan noise.
      knownNames.push(basename);
    }
  }
  return { extensions, knownNames, warnings };
}

async function loadWorkflowInputs(dir: string): Promise<ScanInput[]> {
  const paths = await walkMarkdown(dir);
  paths.sort();
  const inputs: ScanInput[] = [];
  for (const path of paths) {
    inputs.push({
      path: relative(dir, path),
      content: await readFile(path, "utf8"),
    });
  }
  return inputs;
}

/**
 * Produce the full extensions-status snapshot — extensions list, counts,
 * and (when requested) orphan-reference details.
 */
export async function runExtensionsStatus(
  options: ExtensionsStatusOptions,
): Promise<ExtensionsStatusResult> {
  const { cwd, includeOrphanDetails = false } = options;
  const { extensions, knownNames, warnings } = await readExtensionsDirectory(extensionsDir(cwd));
  const workflowInputs = await loadWorkflowInputs(workflowsDir(cwd));

  const refs = scanExtensionPoints(workflowInputs);
  const { orphans } = classifyExtensionRefs(refs, knownNames);

  const activeCount = extensions.filter((e) => e.active).length;
  const inactiveCount = extensions.length - activeCount;

  return {
    mode: "full",
    extensions,
    activeCount,
    inactiveCount,
    orphanCount: orphans.length,
    orphans: includeOrphanDetails ? orphans : [],
    includeOrphanDetails,
    warnings,
  };
}

/**
 * Produce the session-init-scoped result — active-extensions list only.
 *
 * Session-init doesn't need counts or orphan data; skipping the workflow
 * scan keeps this probe proportional to the extensions directory alone.
 */
export async function runExtensionsSessionInitStatus(
  options: ExtensionsSessionInitOptions,
): Promise<ExtensionsSessionInitResult> {
  const { extensions, warnings } = await readExtensionsDirectory(extensionsDir(options.cwd));
  const active = extensions.filter((e) => e.active).map((e) => e.name);
  return { mode: "session-init", active, warnings };
}
