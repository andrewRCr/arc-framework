/** Read a work unit's design thesis from the same source as its metadata. */

import { fromMarkdown } from "mdast-util-from-markdown";

import type { GitBlobEntry } from "../io-context.js";
import { dirname, join, posix, win32 } from "node:path";
import { parseMetaRecord } from "../active/meta-reader.js";
import type { ProjectReadinessRecord, ProjectReadinessRecordSource } from "./project-view.js";

/** Caller-bound artifact I/O; ref reads never acquire missing objects. */
export interface WorkUnitArtifactReaders {
  fs: { readFile(path: string): Promise<string> };
  readAtRef(ref: string, path: string): Promise<GitBlobEntry | null>;
}

/**
 * Decode one regular artifact from a caller-bound local ref reader.
 * @param ref - Selected local ref.
 * @param path - Repository-relative artifact path.
 * @param readAtRef - Caller-bound tree-entry reader.
 * @returns UTF-8 content, or null for unavailable, nonregular, or undecodable entries.
 */
export async function readRegularWorkUnitArtifact(
  ref: string, path: string, readAtRef: WorkUnitArtifactReaders["readAtRef"],
): Promise<string | null> {
  try {
    const entry = await readAtRef(ref, path);
    if (entry === null || (entry.mode !== "100644" && entry.mode !== "100755")) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes);
  } catch {
    return null;
  }
}

/** One source-bound metadata reader and its sibling-artifact reader. */
export interface WorkUnitArtifactReader {
  location: { kind: "checkout"; metaPath: string } | { kind: "ref"; ref: string; metaPath: string };
  readMeta(): Promise<string | null>;
  readArtifact(name: string): Promise<string | null>;
}

/** The selected Design entry, including its complete renderable content. */
export interface WorkUnitDesignArtifact {
  name: string;
  content: string;
  purpose: string | null;
}

/**
 * Bind metadata and sibling reads to one checkout or local ref.
 * @param source - Selected record provenance.
 * @param readers - Caller-bound I/O adapters.
 * @returns Source-bound readers, or null when the record has no metadata path.
 */
export function createWorkUnitArtifactReader(
  source: ProjectReadinessRecordSource,
  readers: WorkUnitArtifactReaders,
): WorkUnitArtifactReader | null {
  if (source.path === undefined) return null;
  const separator = source.path.indexOf(":");
  const ref = source.kind === "in-flight-meta" ? source.path.slice(0, separator) : null;
  if (ref !== null && (separator < 1 || separator === source.path.length - 1)) return null;
  const metaPath = ref === null ? source.path : source.path.slice(separator + 1);
  const paths = ref === null ? { dirname, join } : posix;
  const read = async (path: string): Promise<string | null> => {
    try {
      if (ref === null) return await readers.fs.readFile(path);
      return await readRegularWorkUnitArtifact(ref, path, (selectedRef, artifactPath) => readers.readAtRef(selectedRef, artifactPath));
    } catch {
      return null;
    }
  };
  return {
    location: ref === null ? { kind: "checkout", metaPath } : { kind: "ref", ref, metaPath },
    readMeta: () => read(metaPath),
    readArtifact: (name) => read(paths.join(paths.dirname(metaPath), name)),
  };
}

/**
 * Select the first Design entry with a Purpose field, falling back to the first readable entry.
 * @param metaContent - Work-unit metadata Markdown.
 * @param readArtifact - Reader for artifacts beside this metadata.
 * @returns The selected artifact, or null when none is readable.
 */
export async function selectWorkUnitDesign(
  metaContent: string,
  readArtifact: (name: string) => Promise<string | null>,
): Promise<WorkUnitDesignArtifact | null> {
  let design: string[];
  try {
    design = parseMetaRecord(metaContent).design;
  } catch {
    return null;
  }
  let fallback: WorkUnitDesignArtifact | null = null;
  for (const name of design) {
    if (!isSiblingArtifactName(name)) continue;
    const content = await readArtifact(name);
    if (content === null) continue;
    const artifact = { name, content, purpose: extractWorkUnitPurpose(content) };
    fallback ??= artifact;
    if (purposeField(content) !== null) return artifact;
  }
  return fallback;
}

/** Design references name movable sibling artifacts on every supported platform. */
function isSiblingArtifactName(name: string): boolean {
  return name !== "." && name !== ".."
    && posix.basename(name) === name && win32.basename(name) === name;
}

/**
 * Read a record's thesis through its own metadata and Design list.
 * @param source - Selected metadata provenance.
 * @param readers - Checkout and local-only ref readers bound by the caller.
 * @returns The selected design's thesis, or null when unavailable.
 */
export async function readWorkUnitPurpose(
  source: ProjectReadinessRecordSource,
  readers: WorkUnitArtifactReaders,
): Promise<string | null> {
  const reader = createWorkUnitArtifactReader(source, readers);
  if (reader === null) return null;
  const meta = await reader.readMeta();
  if (meta === null) return null;
  return (await selectWorkUnitDesign(meta, (name) => reader.readArtifact(name)))?.purpose ?? null;
}

/**
 * Enrich selected listing records without mutating the composer's source inputs.
 * @param records - Already-selected project records.
 * @param readers - Readers bound to the listing's checkout/index and local refs.
 * @returns Records carrying their nullable design theses.
 */
export async function resolveWorkUnitPurposes(
  records: readonly ProjectReadinessRecord[],
  readers: WorkUnitArtifactReaders,
): Promise<ProjectReadinessRecord[]> {
  return await Promise.all(records.map(async (record) => ({
    ...record,
    purpose: await readWorkUnitPurpose(record.source, readers),
  })));
}

/**
 * Extract the opening sentence of a Purpose field.
 * @param content - Design artifact Markdown.
 * @returns The thesis, or null when the field has no readable value.
 */
export function extractWorkUnitPurpose(content: string): string | null {
  const field = purposeField(content);
  if (field === null || field === "" || field === "—") return null;
  const codeEnds = codeSpanEnds(field);
  for (let index = 0; index < field.length; index += 1) {
    const codeEnd = codeEnds.get(index);
    if (codeEnd !== undefined) {
      index = codeEnd - 1;
      continue;
    }
    if (/[.?!]/u.test(field[index] ?? "")
      && (index + 1 === field.length || /\s/u.test(field[index + 1] ?? ""))) {
      return field.slice(0, index + 1);
    }
  }
  return field;
}

type MarkdownNode = ReturnType<typeof fromMarkdown> | ReturnType<typeof fromMarkdown>["children"][number];

/** Preserve source offsets so sentence extraction retains the field's Markdown. */
function codeSpanEnds(field: string): Map<number, number> {
  const prefix = "Purpose: ";
  const ends = new Map<number, number>();
  const visit = (node: MarkdownNode): void => {
    if (node.type === "inlineCode") {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ends.set(start - prefix.length, end - prefix.length);
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(fromMarkdown(prefix + field));
  return ends;
}

/** Null distinguishes an absent field from a present, empty field. */
function purposeField(content: string): string | null {
  const paragraph = purposeParagraph(content);
  if (paragraph === null) return null;
  const lines = paragraph.split(/\r?\n/u);
  const values = [(lines[0] ?? "").replace(/^\*\*Purpose:\*\*\s*/u, "")];
  const codeSpans = codeSpanEnds(paragraph);
  let lineStart = 0;
  for (const line of lines.slice(1)) {
    lineStart = paragraph.indexOf("\n", lineStart) + 1;
    const insideCode = [...codeSpans].some(([start, end]) => start <= lineStart && lineStart < end);
    if (!insideCode && /^\*\*[^*]+:\*\*/u.test(line)) break;
    values.push(line.trim());
  }
  return values.join(" ").replace(/\s+/gu, " ").trim();
}

/** Locate a real field inside a paragraph rather than in code or HTML. */
function purposeParagraph(content: string): string | null {
  const visit = (node: MarkdownNode, paragraphEnd?: number): string | null => {
    const end = node.type === "paragraph" ? node.position?.end.offset : paragraphEnd;
    if (node.type === "strong" && end !== undefined) {
      const start = node.position?.start.offset;
      if (start !== undefined && content.startsWith("**Purpose:**", start)) {
        const lineStart = content.lastIndexOf("\n", start - 1) + 1;
        const prefix = content.slice(lineStart, start);
        if (prefix === "" || prefix === "- ") return content.slice(start, end);
      }
    }
    if ("children" in node) {
      for (const child of node.children) {
        const field = visit(child, end);
        if (field !== null) return field;
      }
    }
    return null;
  };
  return visit(fromMarkdown(content));
}
