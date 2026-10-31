/** Base-stamp recovery: the base a file whose stamp was lost merges from, found by content, reading `history` sparingly. */
import { diffComm } from "node-diff3";
import type { HistoryEntry, Store } from "../contract.js";
import { sameReference, type RecordReference, type RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { RecordEntry } from "./index-schema.js";

/** One command's `history` answers, one per record, shared with the worktrees its fan-out visits. */
export interface HistoryMemo {
  /** The record's whole `history`, read once until its entry is dropped. */
  read(reference: RecordReference): Promise<StoreResult<HistoryEntry[]>>;
  /** Drop the record's entry, as a landed write's read-back does, so the next read takes its history afresh. */
  drop(reference: RecordReference): void;
}

/**
 * Create a command's `history` memo.
 * @param store - The store `history` is read from.
 * @returns An empty memo.
 */
export function createHistoryMemo(store: Pick<Store, "history">): HistoryMemo {
  // Each entry is the store's whole answer, never one patched with a later write, so a drop is the only update.
  let answers: { reference: RecordReference; answer: Promise<StoreResult<HistoryEntry[]>> }[] = [];
  return {
    read(reference) {
      const held = answers.find((candidate) => sameReference(candidate.reference, reference));
      if (held !== undefined) return held.answer;
      const answer = store.history({ reference });
      answers.push({ reference, answer });
      return answer;
    },
    drop(reference) {
      answers = answers.filter((held) => !sameReference(held.reference, reference));
    },
  };
}

/** What recovery reads: the file's content and its entry, and how to reach what the entry names. */
export interface BaseRecoveryInput {
  /** The file's content as the store would hold it: LF line endings, no stamp. */
  readonly content: string;
  /** The file's index entry, whose base and last persisted write-back are candidates. */
  readonly entry: RecordEntry;
  readonly format: ObjectFormat;
  readonly memo: HistoryMemo;
  /** Reads a copy of what a persisted write-back took in, kept beside the index, by its name. */
  readonly readCopy: (name: string) => Promise<string>;
}

/** The recovered base: a stored version, which goes to the store as the expected version, a kept copy, or empty. */
export type RecoveredBase =
  | { readonly kind: "stored"; readonly version: RecordVersion; readonly content: string }
  | { readonly kind: "copy"; readonly content: string }
  | { readonly kind: "empty" };

/**
 * Recover the base of a file whose stamp was lost.
 * @param input - The file's content, its entry, and the memo and copy reader.
 * @returns The base, or the store's refusal of `history`.
 */
export async function recoverBase(input: BaseRecoveryInput): Promise<StoreResult<RecoveredBase>> {
  const { content, entry } = input;
  // The index's version first, by its blob id, so a file still holding it reads no history.
  if (gitBlobId(content, input.format) === entry.base.blob) {
    return found({ kind: "stored", version: entry.base.version, content });
  }
  const history = await input.memo.read(entry.reference);
  if (history.status === "refused") return history;
  const stored = storedVersions(history.result);
  const exact = stored.find((version) => version.content === content);
  if (exact !== undefined) return found(exact);
  return found(closest(content, await candidates(input, stored)) ?? { kind: "empty" });
}

/** How many newest versions recovery compares beside the index's version and the content taken in. */
const VERSION_WINDOW = 5;

/** The candidates in the order a tie goes: the content taken in, then each stored version newest first. */
async function candidates(input: BaseRecoveryInput, stored: readonly StoredBase[]): Promise<CandidateBase[]> {
  const takenIn = input.entry.persisted?.takenIn;
  const landed = takenIn?.kind === "landed" ? stored.find((version) => version.version === takenIn.version) : undefined;
  const first = takenIn?.kind === "copy" ? { kind: "copy" as const, content: await input.readCopy(takenIn.name) } : landed;
  const versions = stored.filter((version, index) => version !== landed
    && (index < VERSION_WINDOW || version.version === input.entry.base.version));
  return first === undefined ? versions : [first, ...versions];
}

/** The candidate with the fewest lines changed among those the diff matches a non-blank line with; the first wins a tie. */
function closest(content: string, bases: readonly CandidateBase[]): CandidateBase | undefined {
  const lines = content.split("\n");
  let best: { base: CandidateBase; changed: number } | undefined;
  for (const base of bases) {
    const comparison = compareLines(lines, base.content.split("\n"));
    if (comparison.matched && (best === undefined || comparison.changed < best.changed)) {
      best = { base, changed: comparison.changed };
    }
  }
  return best?.base;
}

function compareLines(left: string[], right: string[]): { matched: boolean; changed: number } {
  let matched = false;
  let changed = 0;
  for (const chunk of diffComm(left, right)) {
    if (chunk.common === undefined) changed += chunk.buffer1.length + chunk.buffer2.length;
    else if (chunk.common.some((line) => line.trim() !== "")) matched = true;
  }
  return { matched, changed };
}

type CandidateBase = Exclude<RecoveredBase, { kind: "empty" }>;
type StoredBase = Extract<RecoveredBase, { kind: "stored" }>;

/** The record's versions newest first, its removals left out. */
function storedVersions(history: readonly HistoryEntry[]): StoredBase[] {
  return history.flatMap((entry): StoredBase[] => (
    entry.version === null || entry.content === null ? [] : [{ kind: "stored", version: entry.version, content: entry.content }]
  ));
}

function found(base: RecoveredBase): StoreResult<RecoveredBase> {
  return { status: "ok", result: base };
}
