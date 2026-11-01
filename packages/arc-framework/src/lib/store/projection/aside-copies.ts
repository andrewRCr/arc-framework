/**
 * The rules every reader of an aside copy applies: what it holds, whether its path has moved on since its swap, and the
 * one step that checks a copy and deletes, keeps, or drops it.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Remedy } from "../refusal.js";
import { nameAsideFile, parseAsideFile, type AsideWriterInput } from "./aside.js";
import { retriedMoves, type SwapMoves } from "./aside-moves.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { readStat } from "./change-detection.js";
import type { AsideCopyRecord, RecordEntry } from "./index-schema.js";
import { gateRead, SYSTEM_READ_GATE, type ReadGateDependencies, type ReadGateVerdict } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import { deleteAsideCopy } from "./stampless.js";
import type { TakeInBase, TakeInHeld, TakeInPort, TakeInResult } from "./take-in-port.js";

/** What a copy's path holds now: nothing, a file's blob id, or something not a file, which is never read. */
export type PathHolding =
  | { readonly kind: "absent" }
  | { readonly kind: "file"; readonly blob: string }
  | { readonly kind: "not-a-file" };

/**
 * Read what a path holds, by `lstat` first.
 * @param path - The absolute path.
 * @param format - The object format its blob id is taken in.
 * @returns What it holds.
 */
export async function readPathHolding(path: string, format: ObjectFormat): Promise<PathHolding> {
  const stat = await readStat(path);
  if (stat === null) return { kind: "absent" };
  if (stat.type !== "file") return { kind: "not-a-file" };
  return { kind: "file", blob: gitBlobId(await readFile(path), format) };
}

/**
 * Whether a copy's path has moved on since its swap: it holds anything but what the swap linked, or, there or not, a
 * write-back of it has been sent since. An absent path with none sent has not moved on, whatever it held before.
 * @param copy - The copy's record.
 * @param holding - What its path holds now.
 * @returns Whether it has moved on.
 */
export function hasPathMovedOn(copy: AsideCopyRecord, holding: PathHolding): boolean {
  if (copy.writeBackSent) return true;
  return holding.kind !== "absent" && !(holding.kind === "file" && holding.blob === copy.linked);
}

/**
 * Record, before a write-back of a path sends an edit, that one has been sent since each of its aside copies' swaps.
 * @param entry - The path's entry.
 * @param takenIn - The copy the write-back takes in, which keeps its record as it is, or null for the file itself.
 * @returns The entry with every other copy marked.
 */
export function recordWriteBackSent(entry: RecordEntry, takenIn: string | null): RecordEntry {
  return { ...entry, copies: entry.copies.map((copy) => (copy.name === takenIn ? copy : { ...copy, writeBackSent: true })) };
}

/** One aside copy to settle, and the file it was made of; a put-back's moves are the system's unless a test injects its own. */
export interface AsideCopySettling extends SwapMoves {
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly entry: RecordEntry;
  readonly copy: AsideCopyRecord;
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  /** The process settling the copy, which names any copy it makes in turn. */
  readonly writer: AsideWriterInput;
  /** The read gate's clock, stat, and sleep, the system's unless a caller injects its own. */
  readonly gate?: ReadGateDependencies;
  /** The writer's second check leaves any copy observed empty for the next command's sweep. */
  readonly keepEmpty?: boolean;
}

/** What checking a copy found, with the entry as the check left it; checking deletes nothing. */
export type CopyCheck =
  /** It holds no edit: not a file, what its swap moved, what it held when its own take-in landed, or as the port found. */
  | { readonly kind: "no-edit"; readonly entry: RecordEntry }
  /** It holds an edit, but its path has moved on: never sent. */
  | { readonly kind: "moved-on"; readonly entry: RecordEntry }
  /** Still being written: the gate left it for a later check. */
  | { readonly kind: "unsettled"; readonly entry: RecordEntry }
  /** Empty at the writer's second check: retained until the next command's sweep. */
  | { readonly kind: "empty"; readonly entry: RecordEntry }
  /** A directory or other nonregular object stays aside, never deleted or linked back. */
  | { readonly kind: "not-a-file"; readonly entry: RecordEntry; readonly remedy: Remedy }
  /** No longer in the aside folder. */
  | { readonly kind: "gone"; readonly entry: RecordEntry }
  /** It went to the port, which answered; `result` is the whole answer, its entry the one here, `blob` what it sent. */
  | {
    readonly kind: "sent"; readonly answer: TakeInHeld | "taken-in"; readonly entry: RecordEntry; readonly result: TakeInResult;
    readonly blob: string;
  };

/**
 * Check one aside copy, taking in an edit it holds where its path has not moved on. The copy is read by `lstat` first,
 * so one that is not a file is never followed.
 * @param input - The copy, the file it was made of, and how to take an edit in.
 * @returns What the check found.
 */
export async function checkAsideCopy(input: AsideCopySettling): Promise<CopyCheck> {
  const { checkout, path, copy, entry } = input;
  const markdown = path.endsWith(".md");
  const gated = await gateRead({ path: join(checkout, copy.name), markdown }, input.gate ?? SYSTEM_READ_GATE);
  if (input.keepEmpty && observedEmpty(gated)) return { kind: "empty", entry };
  if (gated.kind === "absent") return { kind: "gone", entry };
  if (gated.kind === "pending") return { kind: "unsettled", entry };
  if (gated.kind === "no-edit") {
    if (gated.deleted === "not-a-file" && (await readStat(join(checkout, copy.name)))?.type === "other") {
      return { kind: "not-a-file", entry: { ...entry, pending: true }, remedy: gated.remedy };
    }
    return { kind: "no-edit", entry };
  }
  const bytes = await readFile(join(checkout, copy.name));
  if (input.keepEmpty && bytes.byteLength === 0) return { kind: "empty", entry };
  const blob = gitBlobId(bytes, input.format);
  // What the swap moved, or what the copy held when its own take-in landed, is no edit wherever it is read.
  if (blob === copy.moving || blob === copy.landed) return { kind: "no-edit", entry };
  // An older save from the same buffer and another editor's newer one cannot be told apart, so it is never sent.
  if (hasPathMovedOn(copy, await readPathHolding(join(checkout, path), input.format))) return { kind: "moved-on", entry };
  const base = copyBase(copy, bytes, markdown);
  const result = await input.takeIn({ checkout, path, copy: copy.name, entry, base });
  if (result.answer === "no-edit") return { kind: "no-edit", entry: result.entry };
  return { kind: "sent", answer: result.answer, entry: result.entry, result, blob };
}

function observedEmpty(verdict: ReadGateVerdict): boolean {
  if (verdict.kind === "read") return verdict.stat.size === 0n;
  return (verdict.kind === "pending" && verdict.reason === "empty")
    || (verdict.kind === "no-edit" && verdict.deleted === "emptied");
}

/** What settling a copy did, with the entry as it now stands. */
export type CopySettlement =
  /** A directory or other nonregular object is retained, reported with its path and a repair route. */
  | { readonly kind: "not-a-file"; readonly entry: RecordEntry; readonly path: string; readonly copy: string; readonly remedy: Remedy }
  /** It held no edit, or its edit landed whole: deleted, its record cleared. */
  | { readonly kind: "deleted"; readonly entry: RecordEntry }
  /** It holds an edit, but its path has moved on: kept and reported with its path, never sent. */
  | { readonly kind: "moved-on"; readonly entry: RecordEntry; readonly path: string; readonly copy: string }
  /** Kept for a later check: still being written, its take-in did not land, or empty at its writer's second check. */
  | { readonly kind: "kept"; readonly entry: RecordEntry; readonly answer: TakeInHeld | "unsettled" | "empty" }
  /** No longer in the aside folder: its record dropped. */
  | { readonly kind: "dropped"; readonly entry: RecordEntry }
  /**
   * Its edit was refused, unparseable, or clashed, and its path had not moved on: the copy is back at its path, the file
   * pending, and refused or held by its clash's markers. A swap back moves the replacement aside as `replacement`.
   */
  | {
    readonly kind: "returned"; readonly entry: RecordEntry; readonly held: HeldEdit; readonly how: "swapped-back" | "linked-back";
    readonly replacement: string | null;
  }
  /** Its edit was refused, unparseable, or clashed, but its path has moved on: kept, reported with its path. */
  | { readonly kind: "held-aside"; readonly entry: RecordEntry; readonly path: string; readonly copy: string; readonly held: HeldEdit };

/** An answer whose edit is never deleted while it stands. */
export type HeldEdit = "refused" | "unparseable" | "clashed";

/**
 * Check one aside copy and settle it: delete it once it holds no edit or its edit landed whole, else keep it.
 * @param input - The copy, the file it was made of, and how to take an edit in.
 * @returns What became of it.
 */
export async function settleAsideCopy(input: AsideCopySettling): Promise<CopySettlement> {
  const checked = await checkAsideCopy(input);
  switch (checked.kind) {
    case "not-a-file": return { ...checked, path: input.path, copy: input.copy.name };
    case "empty": return { kind: "kept", entry: checked.entry, answer: "empty" };
    case "no-edit": return deleted(input, checked.entry);
    case "gone": return { kind: "dropped", entry: withoutRecord(checked.entry, input.copy) };
    case "unsettled": return { kind: "kept", entry: checked.entry, answer: "unsettled" };
    case "moved-on": return { kind: "moved-on", entry: checked.entry, path: input.path, copy: input.copy.name };
    case "sent": {
      const { answer } = checked;
      if (answer === "taken-in") return deleted(input, checked.entry);
      if (answer === "deferred" || answer === "pending") return { kind: "kept", entry: checked.entry, answer };
      return putBack(input, { ...checked, answer });
    }
  }
}

/**
 * Put a copy whose edit stands refused or clashed back at its path while the path has not moved on: linked back to an
 * absent path, or swapped back onto one holding what its swap linked, the replacement moved aside in turn.
 * @param input - The copy and the file it was made of.
 * @param sent - The port's answer.
 * @returns What became of the copy.
 */
export async function putBack(
  input: AsideCopySettling, sent: Extract<CopyCheck, { readonly kind: "sent" }> & { readonly answer: HeldEdit },
): Promise<CopySettlement> {
  const { checkout, path, copy } = input;
  const moves = retriedMoves(input);
  const at = { copy: join(checkout, copy.name), path: join(checkout, path) };
  const holding = await readPathHolding(at.path, input.format);
  const aside: CopySettlement = { kind: "held-aside", entry: sent.entry, path, copy: copy.name, held: sent.answer };
  if (hasPathMovedOn(copy, holding)) return aside;
  const refused = "mark" in sent.result ? sent.result.mark : sent.entry.refused;
  const marked: RecordEntry = {
    ...sent.entry, pending: true, refused, copies: sent.entry.copies.filter((record) => record.name !== copy.name),
  };
  if (holding.kind !== "file") {
    if (!await moves.linkOnto(at.copy, at.path)) return aside;
    await rm(at.copy, { force: true });
    return { kind: "returned", entry: marked, held: sent.answer, how: "linked-back", replacement: null };
  }
  const replacement = nameAsideFile({ path, base: sent.entry.base.blob, writer: input.writer, role: "aside" });
  await mkdir(dirname(join(checkout, replacement)), { recursive: true });
  await moves.rename(at.path, join(checkout, replacement));
  const record: AsideCopyRecord = { name: replacement, moving: holding.blob, linked: sent.blob, writeBackSent: false, landed: null };
  // A save that recreated the path in between wins it; the copy stays aside, and the replacement beside it.
  if (!await moves.linkOnto(at.copy, at.path)) return { ...aside, entry: { ...sent.entry, copies: [...sent.entry.copies, record] } };
  await rm(at.copy, { force: true });
  return {
    kind: "returned", entry: { ...marked, copies: [...marked.copies, record] }, held: sent.answer, how: "swapped-back",
    replacement,
  };
}

/** A copy is taken in against the stamp it carries, or, stampless, the base blob id its name carries. */
function copyBase(copy: AsideCopyRecord, bytes: Uint8Array, markdown: boolean): TakeInBase {
  if (markdown) return { kind: "stamp", stamp: parseStampedFile(new TextDecoder().decode(bytes)).stamp };
  const named = parseAsideFile(copy.name);
  if (named === undefined) throw new Error(`Not an aside copy's location: ${copy.name}`);
  return { kind: "blob", blob: named.base };
}

async function deleted(input: AsideCopySettling, entry: RecordEntry): Promise<CopySettlement> {
  const { checkout, path } = input;
  if (input.keepEmpty) {
    const stat = await readStat(join(checkout, input.copy.name));
    if (stat?.type === "file" && stat.size === 0n) return { kind: "kept", entry, answer: "empty" };
  }
  return { kind: "deleted", entry: await deleteAsideCopy({ checkout, path, entry, copy: input.copy.name }) };
}

function withoutRecord(entry: RecordEntry, copy: AsideCopyRecord): RecordEntry {
  return { ...entry, copies: entry.copies.filter((record) => record.name !== copy.name) };
}
