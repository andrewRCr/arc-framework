/**
 * Apply a file change plan — the I/O side of update and reconfigure.
 *
 * Takes a `FileChangePlan` (pure data) and executes it: renders templates,
 * reads current files, performs three-way merges, writes results, and builds
 * the new manifest and pristine store.
 *
 * @module
 */

import { join, dirname } from "node:path";
import { unlink } from "node:fs/promises";

import type { FileChangePlan } from "./plan.js";
import { classifyFile, fileLayer } from "../classification.js";
import { hashContent } from "./hash.js";
import { mergeFileContents } from "./merge.js";
import type { FileMergeFn } from "./merge.js";
import { ensureDir } from "../template/index.js";
import type { FileEntry, Manifest } from "../types.js";
import type { ReadFileFn, WriteFileFn, MkdirFn } from "../template/index.js";
import {
  renderTokens, renderConditionals, renderConfigOverrides,
} from "../template/index.js";
import { needsRendering } from "../classification.js";
import {
  ARC_CONFIG_TEMPLATE_PATH,
} from "../constants.js";

// --- Types ---

/** I/O dependencies for applying a change plan. */
export interface ApplyIO {
  readFile: ReadFileFn;
  writeFile: WriteFileFn;
  mkdir: MkdirFn;
}

/** Rendering context needed to render templates during apply. */
export interface RenderContext {
  templateDir: string;
  tokens: Record<string, string>;
  config: Record<string, string>;
  configKeyOverrides: Record<string, string>;
}

/** Result of applying a file change plan. */
export interface ApplyResult {
  /** Files cleanly updated with new framework content. */
  updated: number;
  /** Conflicted file paths requiring manual resolution. */
  conflicts: string[];
  /** Files whose pristine baseline was rebuilt (missing from store). */
  pristineRebuilt: string[];
  /** Newly added file paths. */
  added: string[];
  /** Removed Framework file paths (auto-deleted). */
  removed: string[];
  /** Removed Configurable file paths (kept on disk for review). */
  keptForReview: string[];
  /** Files with no changes needed. */
  unchanged: number;
  /** Scaffolded files skipped (adopter-owned). */
  skipped: number;
  /** New manifest file entries (keyed by output path). */
  newManifestFiles: Record<string, FileEntry>;
  /** New pristine store (keyed by output path). */
  newPristineStore: Record<string, string>;
}

// --- Shared Helpers ---

/**
 * Render a template file with install config.
 *
 * arc-config.yml uses programmatic line-by-line override (preserving comments).
 * All other files use token substitution + conditional rendering.
 */
export async function renderTemplate(
  templateDir: string,
  templateFile: string,
  tokens: Record<string, string>,
  config: Record<string, string>,
  configKeyOverrides: Record<string, string>,
  readFile: ReadFileFn,
): Promise<string> {
  const raw = await readFile(join(templateDir, templateFile));

  if (templateFile === ARC_CONFIG_TEMPLATE_PATH) {
    return renderConfigOverrides(raw, configKeyOverrides);
  }

  if (needsRendering(templateFile)) {
    return renderConditionals(renderTokens(raw, tokens), config, templateFile);
  }

  return raw;
}

/** Delete a file, ignoring ENOENT. */
export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// --- Apply Orchestrator ---

/**
 * Apply a file change plan to disk.
 *
 * Processes additions, removals, and merges from the plan, writing files
 * and building the new manifest entries and pristine store. Scaffolded
 * files are carried forward from the old manifest unchanged.
 *
 * @param plan - The computed change plan (from `buildChangePlan`)
 * @param arcDir - Absolute path to the `.arc/` directory
 * @param oldManifest - The existing manifest (for carry-forward entries)
 * @param mergeFn - Content-based merge function (wraps git merge-file)
 * @param io - Filesystem I/O
 * @param renderCtx - Template rendering context
 * @returns Result with counts, file lists, and new manifest/pristine data
 */
export async function applyChangePlan(
  plan: FileChangePlan,
  arcDir: string,
  oldManifest: Manifest,
  mergeFn: FileMergeFn,
  io: ApplyIO,
  renderCtx: RenderContext,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    updated: 0,
    conflicts: [],
    pristineRebuilt: [],
    added: [],
    removed: [],
    keptForReview: [],
    unchanged: 0,
    skipped: 0,
    newManifestFiles: {},
    newPristineStore: {},
  };

  const render = (templateFile: string) =>
    renderTemplate(
      renderCtx.templateDir, templateFile,
      renderCtx.tokens, renderCtx.config, renderCtx.configKeyOverrides,
      io.readFile,
    );

  const buildEntry = (templateFile: string, content: string, arcInGitFiles: ReadonlySet<string>): FileEntry => {
    const classification = classifyFile(templateFile);
    const entry: FileEntry = {
      classification,
      layer: fileLayer(templateFile, arcInGitFiles),
    };
    if (classification !== "Scaffolded") {
      entry.pristine_hash = hashContent(content);
    }
    return entry;
  };

  // Derive arcInGitFiles from the plan's additions and merges for layer classification
  // (this is already encoded in each entry's layer, but buildEntry needs the set)
  const arcInGitFiles = new Set<string>();
  for (const entry of [...plan.additions, ...plan.merges]) {
    if (entry.layer === "arc-in-git") {
      arcInGitFiles.add(entry.templateFile);
    }
  }

  // --- Process merges (keep-set, non-scaffolded) ---

  for (const entry of plan.merges) {
    const updated = await render(entry.templateFile);
    const currentPath = join(arcDir, entry.outputPath);

    // Framework files: wholesale replacement — skip merge, write directly.
    // Adopter modifications are intentionally overwritten; customization
    // uses methods, extensions, or config — not direct Framework edits.
    if (entry.classification === "Framework") {
      let current: string | undefined;
      try {
        current = await io.readFile(currentPath);
      } catch {
        // File missing from disk
      }

      if (current === updated) {
        result.newPristineStore[entry.outputPath] = updated;
        result.newManifestFiles[entry.outputPath] = buildEntry(entry.templateFile, updated, arcInGitFiles);
        result.unchanged++;
      } else {
        await ensureDir(dirname(currentPath), io.mkdir);
        await io.writeFile(currentPath, updated);
        result.newPristineStore[entry.outputPath] = updated;
        result.newManifestFiles[entry.outputPath] = buildEntry(entry.templateFile, updated, arcInGitFiles);
        result.updated++;
      }
      continue;
    }

    // Configurable files: three-way merge preserving adopter customizations
    let current: string | undefined;
    try {
      current = await io.readFile(currentPath);
    } catch {
      // File missing from disk — will be reinstalled
    }

    if (current === undefined) {
      await ensureDir(dirname(currentPath), io.mkdir);
      await io.writeFile(currentPath, updated);
      result.newPristineStore[entry.outputPath] = updated;
      result.newManifestFiles[entry.outputPath] = buildEntry(entry.templateFile, updated, arcInGitFiles);
      result.updated++;
      continue;
    }

    const effectiveBase = entry.pristineContent ?? updated;
    const pristineRebuilt = entry.pristineContent === undefined;

    const merged = await mergeFileContents(mergeFn, current, effectiveBase, updated);

    await ensureDir(dirname(currentPath), io.mkdir);
    await io.writeFile(currentPath, merged.content);

    if (pristineRebuilt) {
      result.pristineRebuilt.push(entry.outputPath);
    }

    if (merged.status !== "conflict") {
      result.newPristineStore[entry.outputPath] = updated;
      result.newManifestFiles[entry.outputPath] = buildEntry(entry.templateFile, updated, arcInGitFiles);
    } else {
      result.newPristineStore[entry.outputPath] = effectiveBase;
      const existing = oldManifest.files[entry.outputPath];
      result.newManifestFiles[entry.outputPath] = existing ?? buildEntry(entry.templateFile, effectiveBase, arcInGitFiles);
    }

    switch (merged.status) {
      case "clean":
        result.updated++;
        break;
      case "conflict":
        result.conflicts.push(entry.outputPath);
        break;
      case "unchanged":
        result.unchanged++;
        break;
    }
  }

  // --- Process additions ---

  for (const entry of plan.additions) {
    const rendered = await render(entry.templateFile);
    const destPath = join(arcDir, entry.outputPath);
    await ensureDir(dirname(destPath), io.mkdir);
    await io.writeFile(destPath, rendered);

    if (entry.classification !== "Scaffolded") {
      result.newPristineStore[entry.outputPath] = rendered;
    }

    result.newManifestFiles[entry.outputPath] = buildEntry(entry.templateFile, rendered, arcInGitFiles);
    result.added.push(entry.outputPath);
  }

  // --- Process removals ---

  for (const entry of plan.removals) {
    const currentPath = join(arcDir, entry.outputPath);

    switch (entry.classification) {
      case "Framework":
        await safeUnlink(currentPath);
        result.removed.push(entry.outputPath);
        break;
      case "Configurable":
        result.keptForReview.push(entry.outputPath);
        break;
      case "Scaffolded":
        // Leave untouched — adopter-owned
        break;
    }
  }

  // --- Carry forward scaffolded files ---

  for (const entry of plan.skipped) {
    if (entry.existingEntry) {
      result.newManifestFiles[entry.outputPath] = {
        ...entry.existingEntry,
        classification: "Scaffolded",
      };
    }
    result.skipped++;
  }

  return result;
}
