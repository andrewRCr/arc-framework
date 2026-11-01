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
import { lineDistance, type HistoryMemo } from "./base-recovery.js";
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
  for (const matches of [sameText, (entry: ListEntry, candidate: ListEntry) => sameHeading(entry, candidate, config)]) {
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
function sameText(entry: ListEntry, candidate: ListEntry): boolean {
  return withoutIdLines(candidate.bytes, () => true) === entry.bytes;
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
  /** The stamp the file carries, null for a file other than Markdown, which carries none. */
  readonly stamp: string | null;
  /** The file's content as the store would hold it. */
  readonly content: string;
  readonly memo: HistoryMemo;
}

/**
 * Select the base of a save from what the file's last persisted write-back took in: for Markdown, where the save carries
 * the stamp that write-back read; for a file other than Markdown, the closer of a kept copy and the version the write
 * landed.
 * @param input - The file's entry, stamp, and content, and how to reach copies and `history`.
 * @returns The base, null where the rule does not select one, or the store's refusal of `history`.
 */
export async function selectPersistedBase(input: PersistedBaseInput): Promise<StoreResult<PersistedBase | null>> {
  const persisted = input.entry.persisted;
  if (persisted === null) return { status: "ok", result: null };
  const { takenIn } = persisted;
  if (input.stamp === null) return takenIn.kind === "copy" ? closerOfCopyAndLanded(input, takenIn.name, takenIn.version) : { status: "ok", result: null };
  if (input.stamp !== persisted.stamp) return { status: "ok", result: null };
  if (takenIn.kind === "landed") return { status: "ok", result: { kind: "stored", version: takenIn.version } };
  return { status: "ok", result: { kind: "copy", content: await readTakenInCopy(input.location, takenIn.name) } };
}

/**
 * A file with no stamp cannot tell a stale buffer's save from an edit of what the read-back laid, so it takes whichever
 * is closer: the kept copy, which wins a tie, or the version that write landed, regardless of later read-backs or refreshes.
 */
async function closerOfCopyAndLanded(input: PersistedBaseInput, name: string, version: RecordVersion): Promise<StoreResult<PersistedBase>> {
  const copy = await readTakenInCopy(input.location, name);
  const history = await input.memo.read(input.entry.reference);
  if (history.status === "refused") return history;
  const landed = history.result.find((entry) => entry.version === version)?.content ?? null;
  const lines = input.content.split("\n");
  const closerToLanded = landed !== null
    && lineDistance(lines, landed.split("\n")).changed < lineDistance(lines, copy.split("\n")).changed;
  return { status: "ok", result: closerToLanded ? { kind: "stored", version } : { kind: "copy", content: copy } };
}

/** How a write-back ended: a landing, which persists, or an outcome that lands nothing. */
export type WriteBackOutcome =
  | { readonly kind: "landed"; readonly version: RecordVersion }
  | { readonly kind: "refused" | "deferred" | "skipped" | "clashed" };

/** What write-back's read-back hands the recording. */
export interface WriteBackRecording {
  readonly location: ProjectionLocation;
  readonly entry: RecordEntry;
  /** The stamp write-back read from the file. */
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

/** An ID line in either entry shape, `- _Id:_` under a heading or `_Id:_` under a field header. */
const ID_LINE = /^\s*(?:-\s+)?_Id:_\s*`([0-9a-f]{8})`\s*$/u;

/**
 * Whether the record read back holds the content taken in, apart from the ID lines the store stamped: those whose IDs
 * the content taken in lacks, with the final newline normalized.
 */
function sameApartFromStampedIds(readBack: string, takenIn: string, grammar: EntryListConfig | undefined): boolean {
  const carried = grammar === undefined ? new Set<string>() : carriedIds(splitEntryList(takenIn, grammar));
  const kept = withoutIdLines(readBack, (id) => !carried.has(id));
  return withFinalNewline(kept) === withFinalNewline(takenIn);
}

function carriedIds(split: SplitEntryList): Set<string> {
  return new Set(entriesOf(split).flatMap((entry) => (entry.id === undefined ? [] : [entry.id])));
}

/** Remove each ID line, outside comments, whose ID `drop` selects. */
function withoutIdLines(content: string, drop: (id: string) => boolean): string {
  const lines = content.match(/[^\n]*(?:\n|$)/gu) ?? [];
  const masked = maskComments(content).match(/[^\n]*(?:\n|$)/gu) ?? [];
  return lines.filter((_line, index) => {
    const id = ID_LINE.exec((masked[index] ?? "").replace(/\n$/u, ""))?.[1];
    return id === undefined || !drop(id);
  }).join("");
}

function withFinalNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
