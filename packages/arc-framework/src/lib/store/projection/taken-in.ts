/**
 * What a persisted write-back took in: recorded in the file's index entry, kept as a copy where the store never held it,
 * and selected as the base of a save that carries the stamp that write-back read.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  fieldHeaderSpans, maskComments, rejoinEntryList, splitEntryList, type EntryListConfig, type ListEntry, type SplitEntryList,
} from "../concurrency/entries.js";
import { insertEntryId } from "../concurrency/stamp.js";
import { atomicWriteFile } from "../../fs.js";
import type { RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { type HistoryMemo } from "./base-recovery.js";
import type { RecordEntry } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";

/** The folder under `arc-projection/` that keeps copies of content a persisted write-back took in. */
export const TAKEN_IN_FOLDER = "taken-in";

/**
 * Give each entry of `content` that carries no ID the ID of the one reference entry it matches: by text apart from the
 * ID line, else by heading, each only where the match is unique both ways.
 * @param content - The document whose entries take IDs.
 * @param reference - The document whose entries' IDs are given.
 * @param config - The kind's entry grammar.
 * @returns The document with the matched ID lines inserted.
 */
export function restoreEntryIds(content: string, reference: string, config: EntryListConfig): string {
  const split = splitEntryList(content, config);
  const carried = carriedIds(split);
  const candidates = entriesOf(splitEntryList(reference, config)).filter((entry) => entry.id !== undefined && !carried.has(entry.id));
  const missing = entriesOf(split).filter((entry) => entry.id === undefined);
  const given = new Map<ListEntry, string>();
  // Text first; the heading pass reads only what the text pass left on both sides.
  for (const matches of [
    (entry: ListEntry, candidate: ListEntry) => sameText(entry, candidate, config),
    (entry: ListEntry, candidate: ListEntry) => sameHeading(entry, candidate, config),
  ]) {
    const open = candidates.filter((candidate) => ![...given.values()].includes(candidate.id ?? ""));
    const waiting = missing.filter((entry) => !given.has(entry));
    for (const entry of waiting) {
      const found = open.filter((candidate) => matches(entry, candidate));
      const only = found.length === 1 ? found[0] : undefined;
      // A reference entry two entries match the same way goes to neither.
      if (only?.id !== undefined && waiting.filter((other) => matches(other, only)).length === 1) given.set(entry, only.id);
    }
  }
  return rejoinEntryList({ parts: split.parts.map((part) => {
    const id = part.kind === "entry" ? given.get(part) : undefined;
    return part.kind !== "entry" || id === undefined ? part : { ...part, id, bytes: insertEntryId(part, config, id) };
  }) });
}

/** Whether an entry's text equals a reference entry's apart from that entry's ID line. */
function sameText(entry: ListEntry, candidate: ListEntry, config: EntryListConfig): boolean {
  return withoutEntryId(candidate, config) === entry.bytes;
}

/** Whether two entries share a heading, or in a field-header list, a field header. */
function sameHeading(entry: ListEntry, candidate: ListEntry, config: EntryListConfig): boolean {
  return headingOf(entry, config) === headingOf(candidate, config);
}

function headingOf(entry: ListEntry, config: EntryListConfig): string {
  const lines = maskComments(entry.bytes).split("\n");
  if (config.shape === "heading") return (lines[0] ?? "").trimEnd();
  const header = fieldHeaderSpans(lines).find((span) => span.problem === null);
  return header === undefined ? "" : lines.slice(header.start, header.end + 1).map((line) => line.trim()).join(" ");
}

function entriesOf(split: SplitEntryList): ListEntry[] {
  return split.parts.filter((part): part is ListEntry => part.kind === "entry");
}

/**
 * Read a kept copy of what a persisted write-back took in.
 * @param location - The located checkout.
 * @param name - The copy's name, as the entry records it.
 * @returns Its content.
 */
export async function readTakenInCopy(location: ProjectionLocation, name: string): Promise<string> {
  return readFile(join(location.stateDir, TAKEN_IN_FOLDER, name), "utf8");
}

/**
 * Remove kept copies the index no longer names, once the index that stopped naming them is written.
 * @param location - The located checkout.
 * @param names - The copies' names.
 */
export async function removeTakenInCopies(location: ProjectionLocation, names: readonly string[]): Promise<void> {
  await Promise.all(names.map((name) => rm(join(location.stateDir, TAKEN_IN_FOLDER, name), { force: true })));
}

/** Keep a copy inside the state folder, which exists under the projection lock, never creating that folder. */
async function keepCopy(location: ProjectionLocation, content: string, format: ObjectFormat): Promise<{ name: string; blob: string }> {
  const blob = gitBlobId(content, format);
  const name = `${blob}.${randomBytes(8).toString("hex")}`;
  const folder = join(location.stateDir, TAKEN_IN_FOLDER);
  try {
    await mkdir(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  await atomicWriteFile(join(folder, name), content, { createParents: false });
  return { name, blob };
}

/** The base a save takes from what a persisted write-back took in: a stored version, or a kept copy the store never held. */
export type PersistedBase =
  | { readonly kind: "stored"; readonly version: RecordVersion }
  | { readonly kind: "copy"; readonly content: string };

/** What the base selection reads. */
export interface PersistedBaseInput {
  readonly location: ProjectionLocation;
  readonly entry: RecordEntry;
  /** A Markdown file's stamp, null where it was lost or the file carries none. */
  readonly stamp: string | null;
}

/**
 * Select the base of a Markdown save carrying the stamp its last persisted write-back read. Files without a stamp
 * select no base here; their recorded candidates are compared by agreement.
 * @param input - The file's entry, stamp, and location of its kept copies.
 * @returns The matching persisted base, or null where the stamp does not select one.
 */
export async function selectPersistedBase(input: PersistedBaseInput): Promise<StoreResult<PersistedBase | null>> {
  const persisted = input.entry.persisted;
  if (persisted === null) return { status: "ok", result: null };
  const { takenIn } = persisted;
  if (input.stamp === null) return { status: "ok", result: null };
  if (input.stamp !== persisted.stamp) return { status: "ok", result: null };
  if (takenIn.kind === "landed") return { status: "ok", result: { kind: "stored", version: takenIn.version } };
  return { status: "ok", result: { kind: "copy", content: await readTakenInCopy(input.location, takenIn.name) } };
}

/** How a write-back ended: a landing, which persists, or an outcome that lands nothing. */
export type WriteBackOutcome =
  | { readonly kind: "landed"; readonly version: RecordVersion }
  | { readonly kind: "refused" | "deferred" | "skipped" | "clashed" };

/** What write-back's read-back hands the recording. */
export interface WriteBackRecording {
  readonly location: ProjectionLocation;
  readonly entry: RecordEntry;
  /** The Markdown stamp read, or the base blob id the take-in carried for a file without a stamp. */
  readonly stamp: string;
  /** What write-back read from the file after parse-back. */
  readonly takenIn: string;
  readonly outcome: WriteBackOutcome;
  /** The record read back after a landing. */
  readonly readBack: { readonly version: RecordVersion; readonly content: string } | null;
  /** The kind's entry grammar, for a kind whose entries carry IDs. */
  readonly grammar: EntryListConfig | undefined;
  readonly format: ObjectFormat;
  readonly memo: HistoryMemo;
}

/**
 * Record what a write-back took in, where it persisted.
 * @param input - What the read-back hands over.
 * @returns The entry to write, and the names of copies to remove once the index holding it is written.
 */
export async function recordWriteBack(input: WriteBackRecording): Promise<{ entry: RecordEntry; released: string[] }> {
  const { outcome, readBack, grammar } = input;
  if (outcome.kind !== "landed") return { entry: input.entry, released: [] };
  if (readBack === null) throw new Error("A landed write-back's recording needs the record read back");
  const takenIn = grammar === undefined ? input.takenIn : restoreEntryIds(input.takenIn, readBack.content, grammar);
  // The read-back puts the version just written in the file, which no earlier answer holds.
  input.memo.drop(input.entry.reference);
  const kept = input.entry.persisted?.takenIn;
  const released = kept?.kind === "copy" ? [kept.name] : [];
  const record = readBack.version === outcome.version && sameApartFromStampedIds(readBack.content, takenIn, grammar)
    ? { kind: "landed" as const, version: outcome.version }
    : { kind: "copy" as const, version: outcome.version, ...await keepCopy(input.location, takenIn, input.format) };
  return { entry: { ...input.entry, persisted: { stamp: input.stamp, takenIn: record } }, released };
}

/**
 * Whether the record read back holds the content taken in, apart from the ID lines the store stamped: those whose IDs
 * the content taken in lacks, with the final newline normalized.
 */
function sameApartFromStampedIds(readBack: string, takenIn: string, grammar: EntryListConfig | undefined): boolean {
  if (grammar === undefined) return withFinalNewline(readBack) === withFinalNewline(takenIn);
  const carried = carriedIds(splitEntryList(takenIn, grammar));
  const split = splitEntryList(readBack, grammar);
  const kept = rejoinEntryList({ parts: split.parts.map((part) => (
    part.kind === "entry" && part.id !== undefined && !carried.has(part.id)
      ? { ...part, bytes: withoutEntryId(part, grammar) } : part
  )) });
  return withFinalNewline(kept) === withFinalNewline(takenIn);
}

function carriedIds(split: SplitEntryList): Set<string> {
  return new Set(entriesOf(split).flatMap((entry) => (entry.id === undefined ? [] : [entry.id])));
}

/** Remove only the entry's managed ID, including the boundary introduced when it was appended at the end. */
function withoutEntryId(entry: ListEntry, config: EntryListConfig): string {
  if (entry.id === undefined) return entry.bytes;
  const pattern = config.shape === "heading"
    ? /^[ \t]*-[ \t]+_Id:_[ \t]*`([0-9a-f]{8})`[ \t]*$/u
    : /^[ \t]*_Id:_[ \t]*`([0-9a-f]{8})`[ \t]*$/u;
  const lines = [...maskComments(entry.bytes).matchAll(/[^\n]*(?:\n|$)/gu)];
  const line = lines.find((line) => pattern.exec(line[0].replace(/\r?\n$/u, ""))?.[1] === entry.id);
  if (line === undefined) return entry.bytes;
  const before = entry.bytes.slice(0, line.index);
  const after = entry.bytes.slice(line.index + line[0].length);
  return after === "" ? before.replace(/\r?\n$/u, "") : before + after;
}

function withFinalNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
