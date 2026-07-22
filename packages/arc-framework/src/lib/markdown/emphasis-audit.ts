/** Reproducible semantic and byte-level checks for emphasis migrations. */

import { isDeepStrictEqual } from "node:util";

import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

import { ArcError, type ManagedPath } from "../kernel/index.js";
import { validateMarkdownPath } from "./authority.js";
import {
  prepareMarkdownMigrationInputs,
  type PrepareMarkdownMigrationAuditOptions,
} from "./migration-audit.js";

interface AstNode {
  readonly type: string;
  readonly children?: readonly AstNode[];
  readonly position?: {
    readonly start?: { readonly offset?: number };
    readonly end?: { readonly offset?: number };
  };
}

type EmphasisKind = "emphasis" | "strong";

/** Input bytes and repository-relative identity for one emphasis migration check. */
export interface AuditEmphasisMigrationFileInput {
  readonly path: string;
  readonly baseline: Uint8Array;
  readonly candidate: Uint8Array;
}

/** Reproducible evidence for one emphasis-only migration. */
export interface EmphasisMigrationFileAudit {
  readonly path: ManagedPath;
  readonly changedDelimiters: number;
}

/** Complete emphasis audit evidence pinned to one immutable baseline commit. */
export interface EmphasisMigrationAudit {
  readonly head: string;
  readonly files: readonly EmphasisMigrationFileAudit[];
}

export type PrepareEmphasisMigrationAuditOptions = PrepareMarkdownMigrationAuditOptions;

function parseGfm(content: string): ReturnType<typeof fromMarkdown> {
  return fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
}

function positionFree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(positionFree);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "position")
      .map(([key, child]) => [key, positionFree(child)]),
  );
}

function decodeMarkdownBytes(path: ManagedPath, bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new ArcError(`Cannot audit ${path}: input is not valid UTF-8`, "markdown.invalid-utf8", { cause: error });
  }
}

function delimiterOffsets(path: ManagedPath, tree: AstNode): ReadonlyMap<number, EmphasisKind> {
  const offsets = new Map<number, EmphasisKind>();
  const visit = (node: AstNode): void => {
    if (node.type === "emphasis" || node.type === "strong") {
      const width = node.type === "strong" ? 2 : 1;
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (start === undefined || end === undefined || end - start < width * 2) {
        throw new ArcError(
          `Cannot audit ${path}: emphasis node has no valid source range`,
          "markdown.emphasis-position",
        );
      }
      for (let index = 0; index < width; index += 1) {
        offsets.set(start + index, node.type);
        offsets.set(end - width + index, node.type);
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return offsets;
}

function isPermittedSubstitution(kind: EmphasisKind, baseline: string, candidate: string): boolean {
  return kind === "emphasis"
    ? baseline === "*" && candidate === "_"
    : baseline === "_" && candidate === "*";
}

/** Require full-GFM structural equality and delimiter-only byte substitutions. */
export function auditEmphasisMigrationFile(
  input: AuditEmphasisMigrationFileInput,
): EmphasisMigrationFileAudit {
  const path = validateMarkdownPath(input.path);
  const baseline = decodeMarkdownBytes(path, input.baseline);
  const candidate = decodeMarkdownBytes(path, input.candidate);
  const baselineTree = parseGfm(baseline);
  const candidateTree = parseGfm(candidate);
  if (!isDeepStrictEqual(positionFree(baselineTree), positionFree(candidateTree))) {
    throw new ArcError(`Cannot audit ${path}: GFM syntax changed`, "markdown.emphasis-semantics");
  }
  if (baseline.length !== candidate.length) {
    throw new ArcError(`Cannot audit ${path}: non-delimiter bytes changed`, "markdown.emphasis-boundary");
  }

  const baselineOffsets = delimiterOffsets(path, baselineTree);
  const candidateOffsets = delimiterOffsets(path, candidateTree);
  let changedDelimiters = 0;
  for (let index = 0; index < baseline.length; index += 1) {
    const before = baseline.charAt(index);
    const after = candidate.charAt(index);
    if (before === after) continue;
    const kind = baselineOffsets.get(index);
    if (kind === undefined || candidateOffsets.get(index) !== kind || !isPermittedSubstitution(kind, before, after)) {
      throw new ArcError(`Cannot audit ${path}: non-delimiter bytes changed`, "markdown.emphasis-boundary");
    }
    changedDelimiters += 1;
  }
  return { path, changedDelimiters };
}

/** Pin HEAD, load exact Git baselines, and audit current bytes for the selected scope. */
export async function prepareEmphasisMigrationAudit(
  options: PrepareEmphasisMigrationAuditOptions,
): Promise<EmphasisMigrationAudit> {
  const inputs = await prepareMarkdownMigrationInputs(options);
  return {
    head: inputs.head,
    files: inputs.files.map(({ path, baseline, candidate }) =>
      auditEmphasisMigrationFile({ path, baseline, candidate })),
  };
}
