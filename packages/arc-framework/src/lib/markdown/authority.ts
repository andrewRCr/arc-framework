/** Repository-relative authority and selection for Markdown operations. */

import { join } from "node:path";

import { classifyFile, resolveFileList } from "../classification.js";
import { buildConfigMap } from "../config/index.js";
import { INTERNAL_DIR_SEGMENTS, MANIFEST_FILENAME } from "../constants.js";
import { ArcError, validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { resolveArcPath, resolveTemplateOutputPath } from "../layout/index.js";
import { readManifest, validateManifest } from "../manifest/index.js";
import { loadRecipeFile, validateRecipe } from "../template/recipe.js";
import type { Classification, Manifest, Recipe } from "../types.js";

const PACKAGE_ARC_PREFIX = "packages/arc-framework/arc/";
const PROJECT_ARC_PREFIX = ".arc/";

/** Stable authority identities consumed by Markdown operation policy. */
export type MarkdownAuthorityKind =
  | "package-framework"
  | "rendered-framework"
  | "package-configurable"
  | "project-configurable"
  | "package-scaffold"
  | "project-owned"
  | "derived-readiness"
  | "managed-meta"
  | "excluded";

/** One repository-relative Markdown path and any current package/instance relationship. */
export interface MarkdownPathIdentity {
  readonly path: ManagedPath;
  readonly kind: MarkdownAuthorityKind;
  readonly counterpart?: ManagedPath;
  readonly classification?: Classification;
}

/** Inputs whose combined evidence defines current package/instance relationships. */
export interface CreateMarkdownAuthorityOptions {
  readonly recipe: Recipe;
  readonly manifest: Manifest;
  readonly existingPaths: ReadonlySet<string>;
}

/** Filesystem boundaries for loading current-install authority evidence. */
export interface LoadMarkdownAuthorityOptions {
  readonly root: string;
  readonly readFile: (path: string) => Promise<string>;
  readonly lstat: (path: string) => Promise<MarkdownPathStat>;
}

/** Pure classifier over one validated current-install authority index. */
export interface MarkdownAuthority {
  classify(path: string): MarkdownPathIdentity;
}

/** Loaded current-install evidence and its derived Markdown authority. */
export interface LoadedMarkdownAuthority {
  readonly authority: MarkdownAuthority;
  readonly manifest: Manifest;
  readonly recipe: Recipe;
}

interface MarkdownPathStat {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/** Deterministic formatting disposition resolved before content is read. */
export type MarkdownFormattingRoute =
  | { readonly action: "format-source"; readonly writes: readonly ManagedPath[] }
  | { readonly action: "format-direct"; readonly writes: readonly [ManagedPath] }
  | { readonly action: "regenerate"; readonly path: ManagedPath }
  | { readonly action: "normalize-meta"; readonly path: ManagedPath }
  | { readonly action: "refuse"; readonly reason: "wrong-direction" | "excluded"; readonly remedy?: ManagedPath };

interface Relationship {
  readonly source: ManagedPath;
  readonly output: ManagedPath;
  readonly classification: Classification;
}

function authorityError(message: string, code = "markdown.authority"): ArcError {
  return new ArcError(message, code as `markdown.${Lowercase<string>}`);
}

/** Whether a canonical Markdown path is outside the selected current corpus. */
export function isMarkdownPathExcluded(path: ManagedPath): boolean {
  const segments = path.split("/");
  return segments.some((segment) => segment === "node_modules" || segment === "venv" || segment.startsWith(".venv"))
    || path.startsWith(".arc/completed/")
    || /^\.arc\/user\/[^/]+\/(?:WORKING-MEMORY|USER-INBOX)\.md$/u.test(path)
    || /^\.arc\/(?:.*\/)?temp-[^/]*\.md$/u.test(path)
    || path.startsWith("arc/");
}

function isManagedMeta(path: ManagedPath): boolean {
  return /(?:^|\/)(?:meta)-[^/]+\.md$/u.test(path)
    && (path.startsWith(".arc/active/") || path.startsWith(".arc/backlog/"));
}

/** Validate one canonical repository-relative Markdown path. */
export function validateMarkdownPath(path: string): ManagedPath {
  let managed: ManagedPath;
  try {
    managed = validateManagedPath(path);
  } catch {
    throw authorityError(`Invalid repository-relative Markdown path: ${path}`, "markdown.invalid-path");
  }
  if (!managed.endsWith(".md")) {
    throw authorityError(`Path is not Markdown: ${managed}`, "markdown.non-markdown");
  }
  return managed;
}

/**
 * Build current package/instance authority from recipe, stored install config, and manifest evidence.
 *
 * @param options - Validated current-install evidence and paths known to exist
 * @returns A pure repository-relative classifier
 */
export function createMarkdownAuthority(options: CreateMarkdownAuthorityOptions): MarkdownAuthority {
  const manifestValidation = validateManifest(options.manifest);
  if (!manifestValidation.valid) {
    throw authorityError(
      `Invalid ARC manifest: ${manifestValidation.errors.join("; ")}`,
      "markdown.manifest-invalid",
    );
  }
  const recipeValidation = validateRecipe(options.recipe);
  if (!recipeValidation.valid) {
    throw authorityError(`Invalid init recipe: ${recipeValidation.errors.join("; ")}`, "markdown.recipe-invalid");
  }

  const selectedSources = resolveFileList(
    options.recipe,
    buildConfigMap(options.manifest.install_config),
  );
  const bySource = new Map<string, Relationship>();
  const byOutput = new Map<string, Relationship>();

  for (const sourceRelative of selectedSources) {
    const source = validateManagedPath(`${PACKAGE_ARC_PREFIX}${sourceRelative}`);
    const outputRelative = resolveTemplateOutputPath(sourceRelative);
    const output = validateManagedPath(`${PROJECT_ARC_PREFIX}${outputRelative}`);
    const classification = classifyFile(sourceRelative);
    const existing = byOutput.get(output);
    if (existing !== undefined && existing.source !== source) {
      throw authorityError(`Ambiguous package sources map to ${output}`, "markdown.relationship-ambiguous");
    }
    if (!options.existingPaths.has(output)) {
      throw authorityError(`Mapped Framework output is missing: ${output}`, "markdown.output-missing");
    }
    const manifestEntry = options.manifest.files[outputRelative];
    if (manifestEntry !== undefined && manifestEntry.classification !== classification) {
      throw authorityError(`Manifest classification contradicts recipe mapping for ${output}`, "markdown.manifest-contradiction");
    }
    const relationship = { source, output, classification };
    bySource.set(source, relationship);
    byOutput.set(output, relationship);
  }

  return {
    classify(candidate: string): MarkdownPathIdentity {
      const path = validateMarkdownPath(candidate);
      if (isMarkdownPathExcluded(path)) return { path, kind: "excluded" };
      if (path === ".arc/backlog/ROADMAP.md") return { path, kind: "derived-readiness" };
      if (isManagedMeta(path)) return { path, kind: "managed-meta" };

      const sourceRelationship = bySource.get(path);
      if (sourceRelationship !== undefined) {
        const { classification, output } = sourceRelationship;
        if (classification === "Framework") {
          return { path, kind: "package-framework", counterpart: output, classification };
        }
        return {
          path,
          kind: classification === "Configurable" ? "package-configurable" : "package-scaffold",
          counterpart: output,
          classification,
        };
      }

      const outputRelationship = byOutput.get(path);
      if (outputRelationship !== undefined) {
        const { classification, source } = outputRelationship;
        if (classification === "Framework") {
          return { path, kind: "rendered-framework", counterpart: source, classification };
        }
        return {
          path,
          kind: classification === "Configurable" ? "project-configurable" : "project-owned",
          counterpart: source,
          classification,
        };
      }

      if (path.startsWith(PACKAGE_ARC_PREFIX)) {
        const sourceRelative = path.slice(PACKAGE_ARC_PREFIX.length);
        const classification = classifyFile(sourceRelative);
        return {
          path,
          kind: classification === "Framework"
            ? "package-framework"
            : classification === "Configurable"
              ? "package-configurable"
              : "package-scaffold",
          classification,
        };
      }

      const arcRelative = path.startsWith(PROJECT_ARC_PREFIX)
        ? path.slice(PROJECT_ARC_PREFIX.length)
        : undefined;
      const manifestEntry = arcRelative === undefined ? undefined : options.manifest.files[arcRelative];
      if (manifestEntry?.classification === "Framework") {
        throw authorityError(`Manifest claims an unmapped Framework relationship for ${path}`, "markdown.manifest-contradiction");
      }
      return { path, kind: "project-owned", classification: manifestEntry?.classification };
    },
  };
}

/**
 * Load current-install manifest and recipe evidence without reading selected Markdown content.
 *
 * @param options - Repository root and injected read-only filesystem boundaries
 * @returns Current authority classifier
 */
export async function loadMarkdownAuthorityContext(
  options: LoadMarkdownAuthorityOptions,
): Promise<LoadedMarkdownAuthority> {
  const manifestPath = join(
    options.root,
    resolveArcPath({ kind: "arc-root" }),
    ...INTERNAL_DIR_SEGMENTS,
    MANIFEST_FILENAME,
  );
  let manifest: Manifest | null;
  try {
    manifest = await readManifest(manifestPath, options.readFile);
  } catch (error) {
    throw new ArcError("Cannot load valid Markdown authority manifest evidence", "markdown.manifest-invalid", {
      cause: error,
    });
  }
  if (manifest === null) {
    throw authorityError("Markdown authority manifest evidence is missing", "markdown.manifest-missing");
  }

  const recipePath = join(options.root, "packages/arc-framework/init-recipe.json");
  let recipe: Recipe;
  try {
    recipe = await loadRecipeFile(recipePath, options.readFile);
  } catch (error) {
    throw new ArcError("Cannot load valid Markdown authority recipe evidence", "markdown.recipe-invalid", {
      cause: error,
    });
  }

  const recipeValidation = validateRecipe(recipe);
  if (!recipeValidation.valid) {
    throw authorityError(`Invalid init recipe: ${recipeValidation.errors.join("; ")}`, "markdown.recipe-invalid");
  }
  const existingPaths = new Set<string>();
  for (const sourceRelative of resolveFileList(recipe, buildConfigMap(manifest.install_config))) {
    const output = validateManagedPath(`${PROJECT_ARC_PREFIX}${resolveTemplateOutputPath(sourceRelative)}`);
    try {
      const stat = await options.lstat(join(options.root, ...output.split("/")));
      if (stat.isFile()) existingPaths.add(output);
    } catch {
      // createMarkdownAuthority reports the path-specific missing-output failure.
    }
  }
  return {
    authority: createMarkdownAuthority({ recipe, manifest, existingPaths }),
    manifest,
    recipe,
  };
}

/** Load only the current Markdown authority classifier. */
export async function loadMarkdownAuthority(options: LoadMarkdownAuthorityOptions): Promise<MarkdownAuthority> {
  return (await loadMarkdownAuthorityContext(options)).authority;
}

/**
 * Derive formatter policy from path identity without performing I/O.
 *
 * @param identity - Authority identity produced by {@link createMarkdownAuthority}
 * @returns Formatting action or refusal
 */
export function routeMarkdownFormatting(identity: MarkdownPathIdentity): MarkdownFormattingRoute {
  switch (identity.kind) {
    case "package-framework":
      return identity.counterpart === undefined
        ? { action: "format-direct", writes: [identity.path] }
        : { action: "format-source", writes: [identity.path, identity.counterpart] };
    case "rendered-framework":
      return { action: "refuse", reason: "wrong-direction", remedy: identity.counterpart };
    case "derived-readiness":
      return { action: "regenerate", path: identity.path };
    case "managed-meta":
      return { action: "normalize-meta", path: identity.path };
    case "excluded":
      return { action: "refuse", reason: "excluded" };
    case "package-configurable":
    case "package-scaffold":
    case "project-configurable":
    case "project-owned":
      return { action: "format-direct", writes: [identity.path] };
  }
}

/** Lint includes every current authority copy and excludes only explicit non-corpus identities. */
export function isMarkdownLintIncluded(identity: MarkdownPathIdentity): boolean {
  return identity.kind !== "excluded";
}
