/**
 * The rules every reader of an aside copy applies: what it holds, whether its path has moved on since its swap, and the
 * one step that checks a copy and deletes, keeps, or drops it.
 */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Remedy } from "../refusal.js";
import { nameAsideFile, parseAsideFile, type AsideWriterInput } from "./aside.js";
import { retriedMoves, type SwapMoves } from "./aside-moves.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { projectionFileReader, readStat } from "./change-detection.js";
import type { AsideCopyRecord, RecordEntry, RefusedMark } from "./index-schema.js";
import { gateRead, SYSTEM_READ_GATE, type ReadGateDependencies, type ReadGateVerdict } from "./read-gate.js";
import { sameProjectionFile } from "./returned-copies.js";
import { unshownConflicts } from "./held-conflicts.js";
import { parseStampedFile } from "./stamp.js";
import { deleteAsideCopy, finalizeAsideCopy } from "./stampless.js";
import type { TakeInBase, TakeInHeld, TakeInPort, TakeInResult } from "./take-in-port.js";
import { ArchiveDestinationBlocked, archiveDestinationRefusal, requireArchiveDestination } from "./archive-file.js";

/** What a copy's path holds now: nothing, a file's blob id, or something not a file, which is never read. */
export type PathHolding =
  | { readonly kind: "absent" }
  | { readonly kind: "file"; readonly blob: string }
  | { readonly kind: "not-a-file" };

/**
 * Read what a path holds, by `lstat` first.
 * @param checkout - The file's checkout.
 * @param path - The repository-relative path.
 * @param format - The object format its blob id is taken in.
 * @returns What it holds.
 */
export async function readPathHolding(checkout: string, path: string, format: ObjectFormat): Promise<PathHolding> {
  const absolute = join(checkout, path);
  const reader = projectionFileReader(checkout, path);
  const stat = await reader.stat(absolute);
  requireArchiveDestination(checkout, path);
  if (stat === null) return { kind: "absent" };
  if (stat.type !== "file") return { kind: "not-a-file" };
  const blob = gitBlobId(await reader.read(absolute), format);
  requireArchiveDestination(checkout, path);
  return { kind: "file", blob };
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
  | { readonly kind: "blocked-destination"; readonly entry: RecordEntry; readonly mark: RefusedMark }
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

/** A read-only observation of a saved copy, before consulting or restoring its original destination. */
export type AsideCopyObservation = Exclude<CopyCheck, { readonly kind: "blocked-destination" | "moved-on" | "sent" }>
  | { readonly kind: "edited"; readonly entry: RecordEntry; readonly bytes: Uint8Array; readonly blob: string };

/** Read-only copy inputs, optionally carrying an opaque destination observation instead of traversing its ancestors. */
export type AsideCopyChecking = Pick<AsideCopySettling, "checkout" | "path" | "entry" | "copy" | "format" | "takeIn" | "gate" | "keepEmpty">
  & { readonly holding?: PathHolding };

/**
 * Check one aside copy, taking in an edit it holds where its path has not moved on. The copy is read by `lstat` first,
 * so one that is not a file is never followed.
 * @param input - The copy, the file it was made of, and how to take an edit in.
 * @returns What the check found.
 */
export async function checkAsideCopy(input: AsideCopyChecking): Promise<CopyCheck> {
  const observed = await observeAsideCopy(input);
  if (observed.kind !== "edited") return observed;
  const { checkout, path, copy } = input;
  const { entry, bytes, blob } = observed;
  try {
    // An older save from the same buffer and another editor's newer one cannot be told apart.
    if (hasPathMovedOn(copy, input.holding ?? await readPathHolding(checkout, path, input.format))) return { kind: "moved-on", entry };
    requireArchiveDestination(checkout, path);
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "blocked-destination", entry, mark: error.mark };
    throw error;
  }
  const base = copyBase(copy, bytes, path.endsWith(".md"));
  const result = await input.takeIn({ checkout, path, copy: copy.name, entry, base, rendering: copy.rendering, observedEdit: true });
  if (result.answer === "no-edit") return { kind: "no-edit", entry: result.entry };
  return { kind: "sent", answer: result.answer, entry: result.entry, result, blob };
}

/** Compare only the copy's payload with its recorded moving or accepted blob; never settle it or read its destination. */
export async function observeAsideCopy(input: Pick<AsideCopySettling, "checkout" | "path" | "copy" | "entry" | "format" | "gate" | "keepEmpty">): Promise<AsideCopyObservation> {
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
  return { kind: "edited", entry: { ...entry, changed: true }, bytes, blob };
}

function observedEmpty(verdict: ReadGateVerdict): boolean {
  if (verdict.kind === "read") return verdict.stat.size === 0n;
  return (verdict.kind === "pending" && verdict.reason === "empty")
    || (verdict.kind === "no-edit" && verdict.deleted === "emptied");
}

/** What settling a copy did, with the entry as it now stands. */
export type CopySettlement =
  /** A foreign archive destination is left opaque with the copy held in the outer checkout. */
  | { readonly kind: "blocked-destination"; readonly entry: RecordEntry; readonly mark: RefusedMark }
  /** The path and copy are aliases after an interrupted return; publish its restored mapping before unlinking. */
  | { readonly kind: "linked-back"; readonly entry: RecordEntry }
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
  const blocked = blockedAsideDestination(input, input.entry);
  if (blocked !== null) return blocked;
  const linked = await sameProjectionFile(join(input.checkout, input.copy.name), join(input.checkout, input.path));
  const afterAliasCheck = blockedAsideDestination(input, input.entry);
  if (afterAliasCheck !== null) return afterAliasCheck;
  if (linked) {
    return { kind: "linked-back", entry: { ...restoreCopyRendering(input.entry, input.copy), pending: true } };
  }
  const checked = await checkAsideCopy(input);
  const current = blockedAsideDestination(input, checked.entry);
  if (current !== null) return current;
  switch (checked.kind) {
    case "blocked-destination": return checked;
    case "not-a-file": return { ...checked, path: input.path, copy: input.copy.name };
    case "empty": return { kind: "kept", entry: checked.entry, answer: "empty" };
    case "no-edit": return deleted(input, checked.entry);
    case "gone": return { kind: "dropped", entry: await finalizeAsideCopy({
      checkout: input.checkout, path: input.path, entry: checked.entry, copy: input.copy.name,
    }) };
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
 * Its alias and record stay until the caller publishes the restored mapping through `commitReturnedCopies`.
 * @param input - The copy and the file it was made of.
 * @param sent - The port's answer.
 * @returns What became of the copy.
 */
export async function putBack(
  input: AsideCopySettling, sent: Extract<CopyCheck, { readonly kind: "sent" }> & { readonly answer: HeldEdit },
): Promise<CopySettlement> {
  const { checkout, path, copy } = input;
  const blocked = blockedAsideDestination(input, sent.entry);
  if (blocked !== null) return blocked;
  const moves = retriedMoves(input, { checkout, path });
  const at = { copy: join(checkout, copy.name), path: join(checkout, path) };
  const aside: CopySettlement = { kind: "held-aside", entry: sent.entry, path, copy: copy.name, held: sent.answer };
  const refused = "mark" in sent.result ? sent.result.mark : sent.entry.refused;
  const marked: RecordEntry = {
    ...restoreCopyRendering(sent.entry, copy, sent.result.openConflicts), pending: true, refused, copies: sent.entry.copies,
  };
  let replacement: string | null = null;
  let retained = sent.entry;
  try {
    const holding = await readPathHolding(checkout, path, input.format);
    if (hasPathMovedOn(copy, holding)) return aside;
    if (holding.kind === "file") {
      replacement = nameAsideFile({ path, base: sent.entry.base.blob, writer: input.writer, role: "aside" });
      await input.checkpoint?.();
      await mkdir(dirname(join(checkout, replacement)), { recursive: true });
      await moves.rename(at.path, join(checkout, replacement));
      const record: AsideCopyRecord = { name: replacement, moving: holding.blob, linked: sent.blob, writeBackSent: false, landed: null,
        rendering: { markers: sent.entry.markers, notices: sent.entry.notices } };
      retained = { ...retained, copies: [...retained.copies, record] };
    }
    // A save that recreated the path in between wins it; the copy stays aside, and the replacement beside it.
    if (!await moves.linkOnto(at.copy, at.path)) return { ...aside, entry: retained };
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "blocked-destination", entry: retained, mark: error.mark };
    throw error;
  }
  return {
    kind: "returned", entry: { ...marked, copies: retained.copies }, held: sent.answer,
    how: replacement === null ? "linked-back" : "swapped-back", replacement,
  };
}

/** Preserve the complete copy mapping while a late destination change prevents settlement. */
export function blockedAsideDestination(input: Pick<AsideCopySettling, "checkout" | "path">, entry: RecordEntry):
Extract<CopySettlement, { kind: "blocked-destination" }> | null {
  const mark = archiveDestinationRefusal(input.checkout, input.path);
  return mark === null ? null : { kind: "blocked-destination", entry, mark };
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
  const blocked = blockedAsideDestination(input, entry);
  if (blocked !== null) return blocked;
  try {
    return { kind: "deleted", entry: await deleteAsideCopy({ checkout, path, entry, copy: input.copy.name, checkpoint: input.checkpoint }) };
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "blocked-destination", entry, mark: error.mark };
    throw error;
  }
}

/** Restore the mapping only when a copy's own bytes return to its path; current conflict evidence keeps advancing. */
export function restoreCopyRendering(entry: RecordEntry, copy: AsideCopyRecord, open?: readonly import("../identity.js").RecordReference[]): RecordEntry {
  const restored = { ...entry, ...copy.rendering };
  return open === undefined ? restored : { ...restored, unshown: unshownConflicts(restored, open) };
}
