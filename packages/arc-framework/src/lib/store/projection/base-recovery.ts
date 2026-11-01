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

/**
 * The recovered base: a stored version, which goes to the store as the expected version so the store merges from its
 * own content, a kept copy, or empty, which merge in the checkout.
 */
export type RecoveredBase =
  | { readonly kind: "stored"; readonly version: RecordVersion }
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
  if (gitBlobId(content, input.format) === entry.base.blob) return found({ kind: "stored", version: entry.base.version });
  const history = await input.memo.read(entry.reference);
  if (history.status === "refused") {
    return history.refusal.code === "state-unresolvable" ? found(await withoutHistory(input)) : history;
  }
  const stored = storedVersions(history.result);
  const exact = stored.find((candidate) => candidate.content === content);
  if (exact !== undefined) return found(exact.base);
  return found(closest(content, await candidates(input, stored))?.base ?? { kind: "empty" });
}

/**
 * Where `history` refuses `state-unresolvable`, recovery pulls nothing and chooses between the index's version and the
 * content taken in alone. Only a kept copy's content is local: it is taken where the diff matches a non-blank line of the
 * file. A version the write landed, whose content is not local either, is taken over the index's version, being the
 * older base, so a stale buffer's save never merges against a later refresh and undoes it.
 */
async function withoutHistory(input: BaseRecoveryInput): Promise<RecoveredBase> {
  const indexed = { kind: "stored" as const, version: input.entry.base.version };
  const takenIn = input.entry.persisted?.takenIn;
  if (takenIn === undefined) return indexed;
  if (takenIn.kind === "landed") return { kind: "stored", version: takenIn.version };
  const copy = await input.readCopy(takenIn.name);
  return lineDistance(input.content.split("\n"), copy.split("\n")).matched ? { kind: "copy", content: copy } : indexed;
}

/** How many newest versions recovery compares beside the index's version and the content taken in. */
const VERSION_WINDOW = 5;

/** The candidates in the order a tie goes: the content taken in, then each stored version newest first. */
async function candidates(input: BaseRecoveryInput, stored: readonly StoredCandidate[]): Promise<Candidate[]> {
  const takenIn = input.entry.persisted?.takenIn;
  const landed = takenIn?.kind === "landed" ? stored.find((candidate) => candidate.base.version === takenIn.version) : undefined;
  const copy = takenIn?.kind === "copy" ? await input.readCopy(takenIn.name) : undefined;
  const first = copy === undefined ? landed : { base: { kind: "copy" as const, content: copy }, content: copy };
  const versions = stored.filter((candidate, index) => candidate !== landed
    && (index < VERSION_WINDOW || candidate.base.version === input.entry.base.version));
  return first === undefined ? versions : [first, ...versions];
}

/** The candidate with the fewest lines changed among those the diff matches a non-blank line with; the first wins a tie. */
function closest(content: string, candidates: readonly Candidate[]): Candidate | undefined {
  const lines = content.split("\n");
  let best: { candidate: Candidate; changed: number } | undefined;
  for (const candidate of candidates) {
    const comparison = lineDistance(lines, candidate.content.split("\n"));
    if (comparison.matched && (best === undefined || comparison.changed < best.changed)) {
      best = { candidate, changed: comparison.changed };
    }
  }
  return best?.candidate;
}

/**
 * Compare two texts line by line.
 * @param left - One text's lines.
 * @param right - The other's.
 * @returns Whether the diff matches a non-blank line, and how many lines it changes.
 */
export function lineDistance(left: readonly string[], right: readonly string[]): { matched: boolean; changed: number } {
  let matched = false;
  let changed = 0;
  for (const chunk of diffComm([...left], [...right])) {
    if (chunk.common === undefined) changed += chunk.buffer1.length + chunk.buffer2.length;
    else if (chunk.common.some((line) => line.trim() !== "")) matched = true;
  }
  return { matched, changed };
}

/** A base recovery compares, with the content it is compared by. */
interface Candidate {
  readonly base: Extract<RecoveredBase, { kind: "stored" }> | Extract<RecoveredBase, { kind: "copy" }>;
  readonly content: string;
}

/** A stored version as a candidate. */
interface StoredCandidate extends Candidate { readonly base: Extract<RecoveredBase, { kind: "stored" }> }

/** The record's versions newest first, its removals left out. */
function storedVersions(history: readonly HistoryEntry[]): StoredCandidate[] {
  return history.flatMap((entry) => (entry.version === null || entry.content === null ? []
    : [{ base: { kind: "stored" as const, version: entry.version }, content: entry.content }]));
}

function found(base: RecoveredBase): StoreResult<RecoveredBase> {
  return { status: "ok", result: base };
}
