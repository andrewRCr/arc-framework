/** In-memory routing and complete validation for explicit Markdown formatting. */

import { join } from "node:path";

import { locateMetaCoreTable, normalizeMetaCoreTable } from "../active/meta-reader.js";
import { buildConfigKeyOverrides, buildConfigMap, buildTokenMap } from "../config/index.js";
import type { GitExec } from "../git/index.js";
import { ArcError, type ManagedPath } from "../kernel/index.js";
import { renderTemplate } from "../manifest/index.js";
import type { Manifest } from "../types.js";
import {
  adaptMarkdownOperationError,
  createMarkdownRouteDiagnostic,
  type MarkdownChangedRange,
} from "./contracts.js";
import {
  routeMarkdownFormatting,
  loadMarkdownAuthorityContext,
  type MarkdownAuthority,
  type MarkdownPathIdentity,
} from "./authority.js";
import { transformGfmTables } from "./table-transform.js";
import { validateExplicitMarkdownPaths } from "./selection.js";

const PACKAGE_ARC_PREFIX = "packages/arc-framework/arc/";
const encoder = new TextEncoder();

/** One fully computed candidate file in an explicit formatting plan. */
export interface PlannedMarkdownFile {
  readonly path: ManagedPath;
  readonly identity: MarkdownPathIdentity;
  readonly source: "gfm-table" | "meta-core" | "framework-projection";
  readonly bytes: Uint8Array;
  readonly changed: boolean;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

/** A complete in-memory plan; no filesystem mutation has occurred. */
export interface ExplicitMarkdownFormatPlan {
  readonly operation: "format-explicit";
  readonly files: readonly PlannedMarkdownFile[];
}

/** Inputs for planning already validated repository-relative paths. */
export interface PlanExplicitMarkdownFormatOptions {
  readonly root: string;
  readonly paths: readonly ManagedPath[];
  readonly authority: MarkdownAuthority;
  readonly manifest: Manifest;
  readonly readBytes: (path: ManagedPath) => Promise<Uint8Array>;
}

/** Worktree boundaries for validating and loading one complete explicit operation. */
export interface PrepareMarkdownFormatOptions {
  readonly root: string;
  readonly paths: readonly string[];
  readonly exec: GitExec;
  readonly lstat: (path: string) => Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
  }>;
  readonly realpath: (path: string) => Promise<string>;
  readonly readText: (path: string) => Promise<string>;
  readonly readBytes: (path: ManagedPath) => Promise<Uint8Array>;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function decodeMarkdown(path: ManagedPath, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Cannot format ${path}: input is not valid UTF-8`, "markdown.invalid-utf8", { cause: error });
  }
}

function byteRange(content: string, start: number, end: number): MarkdownChangedRange {
  return {
    start: encoder.encode(content.slice(0, start)).length,
    end: encoder.encode(content.slice(0, end)).length,
  };
}

function routeOrThrow(authority: MarkdownAuthority, path: ManagedPath): {
  identity: MarkdownPathIdentity;
  route: ReturnType<typeof routeMarkdownFormatting>;
} {
  const identity = authority.classify(path);
  const route = routeMarkdownFormatting(identity);
  if (route.action !== "refuse" && route.action !== "regenerate") return { identity, route };
  const diagnostic = createMarkdownRouteDiagnostic("format-explicit", identity);
  const error = new ArcError(
    diagnostic?.message ?? `Markdown path cannot be formatted directly: ${path}`,
    diagnostic?.code ?? "markdown.authority-refusal",
  );
  throw adaptMarkdownOperationError({ operation: "format-explicit", path, error, diagnostic });
}

function explicitFormatWritePaths(
  authority: MarkdownAuthority,
  paths: readonly ManagedPath[],
): readonly ManagedPath[] {
  return paths.flatMap((path) => {
    const { route } = routeOrThrow(authority, path);
    switch (route.action) {
      case "format-source":
      case "format-direct":
        return route.writes;
      case "normalize-meta":
        return [route.path];
      case "regenerate":
      case "refuse":
        throw new ArcError(`Markdown path cannot be formatted directly: ${path}`, "markdown.authority-refusal");
    }
  });
}

function frameworkProjectionIdentities(
  authority: MarkdownAuthority,
  paths: readonly ManagedPath[],
): readonly MarkdownPathIdentity[] {
  const identities = paths.map((path) => authority.classify(path));
  for (const identity of identities) {
    if (identity.kind !== "package-framework" || identity.counterpart === undefined) {
      throw new ArcError(
        `Framework projection requires an explicitly installed Framework source: ${identity.path}`,
        "markdown.projection-refused",
      );
    }
  }
  return identities;
}

function frameworkProjectionWritePaths(
  identities: readonly MarkdownPathIdentity[],
): readonly ManagedPath[] {
  return identities.flatMap((identity) => identity.counterpart === undefined
    ? [identity.path]
    : [identity.path, identity.counterpart]);
}

async function renderFrameworkProjection(
  root: string,
  identity: MarkdownPathIdentity,
  sourceBytes: Uint8Array,
  manifest: Manifest,
): Promise<Uint8Array> {
  if (identity.kind !== "package-framework" || identity.counterpart === undefined) {
    throw new ArcError(`Framework source is not installed: ${identity.path}`, "markdown.projection-refused");
  }
  const templateFile = identity.path.slice(PACKAGE_ARC_PREFIX.length);
  const templateDir = join(root, ...PACKAGE_ARC_PREFIX.slice(0, -1).split("/"));
  const source = decodeMarkdown(identity.path, sourceBytes);
  const expectedNativePath = join(templateDir, ...templateFile.split("/"));
  const rendered = await renderTemplate(
    templateDir,
    templateFile,
    buildTokenMap(manifest.install_config),
    buildConfigMap(manifest.install_config),
    buildConfigKeyOverrides(manifest.install_config),
    (path) => {
      if (path !== expectedNativePath) {
        return Promise.reject(
          new ArcError(`Projection requested an unexpected template: ${path}`, "markdown.projection-refused"),
        );
      }
      return Promise.resolve(source);
    },
  );
  return encoder.encode(rendered);
}

async function planGfmFile(
  identity: MarkdownPathIdentity,
  readBytes: PlanExplicitMarkdownFormatOptions["readBytes"],
): Promise<PlannedMarkdownFile> {
  const original = await readBytes(identity.path);
  const transformed = transformGfmTables({ path: identity.path, bytes: original });
  return {
    path: identity.path,
    identity,
    source: "gfm-table",
    bytes: transformed.bytes,
    changed: !equalBytes(original, transformed.bytes),
    changedRanges: transformed.changedRanges,
  };
}

async function planMetaFile(
  identity: MarkdownPathIdentity,
  readBytes: PlanExplicitMarkdownFormatOptions["readBytes"],
): Promise<PlannedMarkdownFile> {
  const original = await readBytes(identity.path);
  const content = decodeMarkdown(identity.path, original);
  const location = locateMetaCoreTable(content);
  const normalized = normalizeMetaCoreTable(content);
  const bytes = encoder.encode(normalized);
  const changed = !equalBytes(original, bytes);
  return {
    path: identity.path,
    identity,
    source: "meta-core",
    bytes,
    changed,
    changedRanges: changed ? [byteRange(content, location.startOffset, location.endOffset)] : [],
  };
}

/** Compute every selected and projected candidate before any write can begin. */
export async function planExplicitMarkdownFormat(
  options: PlanExplicitMarkdownFormatOptions,
): Promise<ExplicitMarkdownFormatPlan> {
  const unique = new Set(options.paths);
  if (unique.size !== options.paths.length) {
    throw new ArcError("Explicit Markdown paths must be unique", "markdown.duplicate-selection");
  }
  const routed = options.paths.map((path) => routeOrThrow(options.authority, path));
  const files: PlannedMarkdownFile[] = [];

  for (const { identity, route } of routed) {
    if (route.action === "normalize-meta") {
      files.push(await planMetaFile(identity, options.readBytes));
      continue;
    }
    const source = await planGfmFile(identity, options.readBytes);
    files.push(source);
    if (route.action !== "format-source") continue;

    const counterpart = identity.counterpart;
    if (counterpart === undefined) {
      throw new ArcError(`Framework projection has no output for ${identity.path}`, "markdown.projection-refused");
    }
    const outputIdentity = options.authority.classify(counterpart);
    const originalOutput = await options.readBytes(counterpart);
    const projected = await renderFrameworkProjection(options.root, identity, source.bytes, options.manifest);
    files.push({
      path: counterpart,
      identity: outputIdentity,
      source: "framework-projection",
      bytes: projected,
      changed: !equalBytes(originalOutput, projected),
      changedRanges: [],
    });
  }

  return { operation: "format-explicit", files };
}

/** Validate all paths and authority routes before loading selected Markdown content. */
export async function prepareExplicitMarkdownFormat(
  options: PrepareMarkdownFormatOptions,
): Promise<ExplicitMarkdownFormatPlan> {
  const paths = await validateExplicitMarkdownPaths({
    root: options.root,
    paths: options.paths,
    operation: "mutate",
    exec: options.exec,
    lstat: options.lstat,
    realpath: options.realpath,
  });
  const loaded = await loadMarkdownAuthorityContext({
    root: options.root,
    readFile: options.readText,
    lstat: options.lstat,
  });
  await validateExplicitMarkdownPaths({
    root: options.root,
    paths: explicitFormatWritePaths(loaded.authority, paths),
    operation: "mutate",
    exec: options.exec,
    lstat: options.lstat,
    realpath: options.realpath,
  });
  return planExplicitMarkdownFormat({
    root: options.root,
    paths,
    authority: loaded.authority,
    manifest: loaded.manifest,
    readBytes: options.readBytes,
  });
}

/** Compute installed Framework projections without applying table transformation to their sources. */
export async function planFrameworkProjection(
  options: PlanExplicitMarkdownFormatOptions,
): Promise<ExplicitMarkdownFormatPlan> {
  const unique = new Set(options.paths);
  if (unique.size !== options.paths.length) {
    throw new ArcError("Framework projection paths must be unique", "markdown.duplicate-selection");
  }
  const identities = frameworkProjectionIdentities(options.authority, options.paths);

  const files: PlannedMarkdownFile[] = [];
  for (const identity of identities) {
    const counterpart = identity.counterpart;
    if (counterpart === undefined) continue;
    const sourceBytes = await options.readBytes(identity.path);
    const originalOutput = await options.readBytes(counterpart);
    const projected = await renderFrameworkProjection(options.root, identity, sourceBytes, options.manifest);
    files.push({
      path: counterpart,
      identity: options.authority.classify(counterpart),
      source: "framework-projection",
      bytes: projected,
      changed: !equalBytes(originalOutput, projected),
      changedRanges: [],
    });
  }
  return { operation: "format-explicit", files };
}

/** Validate explicit worktree paths and prepare their installed Framework projections. */
export async function prepareFrameworkProjection(
  options: PrepareMarkdownFormatOptions,
): Promise<ExplicitMarkdownFormatPlan> {
  const paths = await validateExplicitMarkdownPaths({
    root: options.root,
    paths: options.paths,
    operation: "mutate",
    exec: options.exec,
    lstat: options.lstat,
    realpath: options.realpath,
  });
  const loaded = await loadMarkdownAuthorityContext({
    root: options.root,
    readFile: options.readText,
    lstat: options.lstat,
  });
  const identities = frameworkProjectionIdentities(loaded.authority, paths);
  await validateExplicitMarkdownPaths({
    root: options.root,
    paths: frameworkProjectionWritePaths(identities),
    operation: "mutate",
    exec: options.exec,
    lstat: options.lstat,
    realpath: options.realpath,
  });
  return planFrameworkProjection({
    root: options.root,
    paths,
    authority: loaded.authority,
    manifest: loaded.manifest,
    readBytes: options.readBytes,
  });
}
