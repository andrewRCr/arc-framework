/**
 * Merge baselines for Configurable files — recovering the ones the tracked manifest can prove, and naming the rest.
 *
 * A three-way merge needs the content last installed. The pristine store holds it but is not committed, so a fresh
 * clone, another machine, or another worktree has none. The committed manifest records each file's installed hash,
 * which recovers the baseline whenever either side still matches it: an unedited file is its own baseline, and an
 * update that upstream never changed is the baseline. A customized file matching neither cannot be merged without
 * dropping upstream changes, so update and reconfigure refuse it unless the caller opts to keep it local.
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

/** Reads for baseline resolution: raw bytes for hashing and templates, and the file as the merge will see it. */
export interface BaselineReads {
  readFile: ReadFileFn;
  /** Defaults to `readFile`; differs only where the caller migrates a file's content before merging it. */
  readAsMerged?: ReadFileFn;
}

/** Baselines the manifest proves, and the customized files left with none. */
export interface MissingBaselineResolution {
  /** Recovered baselines keyed by output path, to add to the pristine store before planning again. */
  recovered: Record<string, string>;
  /** Output paths whose upstream changes a merge would drop. */
  edits: string[];
}

/**
 * Resolve each Configurable merge the plan leaves without a stored baseline.
 *
 * @param plan - The change plan over the stored baselines
 * @param manifest - The committed manifest, whose `pristine_hash` records each file's installed content
 * @param arcDir - Absolute path to the `.arc/` directory
 * @param reads - Raw and merge-view reads
 * @param renderCtx - Template rendering context
 * @returns The recovered baselines and the customized files with none
 */
export async function resolveMissingBaselines(
  plan: FileChangePlan,
  manifest: Manifest,
  arcDir: string,
  reads: BaselineReads,
  renderCtx: RenderContext,
): Promise<MissingBaselineResolution> {
  const resolution: MissingBaselineResolution = { recovered: {}, edits: [] };
  for (const entry of plan.merges) {
    if (entry.classification !== "Configurable" || entry.pristineContent !== undefined) continue;
    const path = join(arcDir, entry.outputPath);
    let current: string;
    try {
      current = await reads.readFile(path);
    } catch {
      continue;
    }
    const updated = await renderTemplate(
      renderCtx.templateDir, entry.templateFile,
      renderCtx.tokens, renderCtx.config, renderCtx.configKeyOverrides,
      reads.readFile,
    );
    const installedHash = manifest.files[entry.outputPath]?.pristine_hash;
    const baseline = installedHash === undefined
      ? undefined
      : [current, updated].find((side) => hashContent(side) === installedHash);
    if (baseline !== undefined) {
      resolution.recovered[entry.outputPath] = baseline;
    } else if (await (reads.readAsMerged ?? reads.readFile)(path) !== updated) {
      resolution.edits.push(entry.outputPath);
    }
  }
  return resolution;
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
