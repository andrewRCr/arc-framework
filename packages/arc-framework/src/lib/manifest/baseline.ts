/**
 * Merge baselines for Configurable files — recovering the ones the tracked manifest can prove, and naming the rest.
 *
 * A three-way merge needs the content last installed. The pristine store holds it but is not committed, so a fresh
 * clone, another machine, or another worktree has none. The committed manifest records each file's installed hash:
 * a file still matching it is its own baseline. A customized file with no baseline cannot be merged without dropping
 * upstream changes, so update and reconfigure refuse it unless the caller opts to keep it local.
 *
 * @module
 */

import { join } from "node:path";

import { renderTemplate, type RenderContext } from "./apply.js";
import { hashContent } from "./hash.js";
import type { FileChangePlan } from "./plan.js";
import { UserFacingError } from "../errors.js";
import type { ReadFileFn } from "../template/index.js";
import type { Manifest } from "../types.js";
import { PRISTINE_FILENAME } from "../constants.js";

/**
 * Recover the baseline of each file still byte-identical to its last install.
 *
 * @param manifest - The committed manifest, whose `pristine_hash` records each file's installed content
 * @param pristineStore - The loaded store; entries it already holds are left alone
 * @param arcDir - Absolute path to the `.arc/` directory
 * @param readFile - Reads a file's raw content
 * @returns Recovered baselines keyed by output path
 */
export async function recoverUneditedBaselines(
  manifest: Manifest,
  pristineStore: Readonly<Record<string, string>>,
  arcDir: string,
  readFile: ReadFileFn,
): Promise<Record<string, string>> {
  const recovered: Record<string, string> = {};
  for (const [path, entry] of Object.entries(manifest.files)) {
    if (entry.pristine_hash === undefined || pristineStore[path] !== undefined) continue;
    let current: string;
    try {
      current = await readFile(join(arcDir, path));
    } catch {
      continue;
    }
    if (hashContent(current) === entry.pristine_hash) recovered[path] = current;
  }
  return recovered;
}

/**
 * Find the Configurable files a merge would update with no baseline, other than those already matching the update.
 *
 * @param plan - The change plan, built after baseline recovery
 * @param arcDir - Absolute path to the `.arc/` directory
 * @param readFile - Reads current files as the merge will, and templates
 * @param renderCtx - Template rendering context
 * @returns Output paths whose upstream changes a merge would drop
 */
export async function findEditsWithoutBaseline(
  plan: FileChangePlan,
  arcDir: string,
  readFile: ReadFileFn,
  renderCtx: RenderContext,
): Promise<string[]> {
  const edits: string[] = [];
  for (const entry of plan.merges) {
    if (entry.classification !== "Configurable" || entry.pristineContent !== undefined) continue;
    let current: string;
    try {
      current = await readFile(join(arcDir, entry.outputPath));
    } catch {
      continue;
    }
    const updated = await renderTemplate(
      renderCtx.templateDir, entry.templateFile,
      renderCtx.tokens, renderCtx.config, renderCtx.configKeyOverrides,
      readFile,
    );
    if (current !== updated) edits.push(entry.outputPath);
  }
  return edits;
}

/**
 * Build the refusal for customized files that have no merge baseline.
 *
 * @param paths - Output paths with no baseline
 * @param command - The refusing command, named in the message
 * @returns The user-facing refusal, naming each file and both remedies
 */
export function missingBaselineError(paths: readonly string[], command: "update" | "reconfigure"): UserFacingError {
  const files = paths.map((path) => `.arc/${path}`).join(", ");
  return new UserFacingError({
    code: "manifest.baseline-missing",
    whatHappened: `${command} could drop upstream changes to customized files with no merge baseline`,
    why: `This checkout has no merge baseline for: ${files}. Baselines live in the uncommitted `
      + `.arc/system/.internal/${PRISTINE_FILENAME}, so a fresh clone or another worktree has none.`,
    whatToDo: `Copy .arc/system/.internal/${PRISTINE_FILENAME} from the checkout that last installed or updated ARC `
      + "and retry, or run `arc update --keep-local-without-baseline` to keep these files as they are, skipping "
      + "their upstream changes.",
  });
}
