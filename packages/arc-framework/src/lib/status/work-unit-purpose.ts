/** Read a work unit's design thesis from the same source as its metadata. */

import type { GitBlobEntry } from "../io-context.js";
import { dirname, join, posix } from "node:path";
import { parseMetaRecord } from "../active/meta-reader.js";
import type { ProjectReadinessRecordSource } from "./project-view.js";

/** Caller-bound artifact I/O; ref reads never acquire missing objects. */
export interface WorkUnitArtifactReaders {
  fs: { readFile(path: string): Promise<string> };
  readAtRef(ref: string, path: string): Promise<GitBlobEntry | null>;
}

/** One source-bound metadata reader and its sibling-artifact reader. */
export interface WorkUnitArtifactReader {
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
      const entry = await readers.readAtRef(ref, path);
      if (entry === null || (entry.mode !== "100644" && entry.mode !== "100755")) return null;
      return new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes);
    } catch {
      return null;
    }
  };
  return {
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
    const content = await readArtifact(name);
    if (content === null) continue;
    const artifact = { name, content, purpose: extractWorkUnitPurpose(content) };
    fallback ??= artifact;
    if (purposeField(content) !== null) return artifact;
  }
  return fallback;
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
 * Extract the opening sentence of a Purpose field.
 * @param content - Design artifact Markdown.
 * @returns The thesis, or null when the field has no readable value.
 */
export function extractWorkUnitPurpose(content: string): string | null {
  const field = purposeField(content);
  if (field === null || field === "" || field === "—") return null;
  let codeDelimiter = 0;
  for (let index = 0; index < field.length; index += 1) {
    if (field[index] === "`") {
      const start = index;
      while (field[index + 1] === "`") index += 1;
      const length = index - start + 1;
      if (codeDelimiter === 0) codeDelimiter = length;
      else if (codeDelimiter === length) codeDelimiter = 0;
    } else if (codeDelimiter === 0 && /[.?!]/u.test(field[index] ?? "")
      && (index + 1 === field.length || /\s/u.test(field[index + 1] ?? ""))) {
      return field.slice(0, index + 1);
    }
  }
  return field;
}

/** Null distinguishes an absent field from a present, empty field. */
function purposeField(content: string): string | null {
  const lines = content.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^(?:- )?\*\*Purpose:\*\*/u.test(line));
  if (start < 0) return null;
  const values = [(lines[start] ?? "").replace(/^(?:- )?\*\*Purpose:\*\*\s*/u, "")];
  for (const line of lines.slice(start + 1)) {
    if (/^\s*$|^\s*(?:#{1,6} |[-*] |\*\*|---)/u.test(line)) break;
    values.push(line.trim());
  }
  return values.join(" ").replace(/\s+/gu, " ").trim();
}
