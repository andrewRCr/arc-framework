/** Write-back's read gate: a projected file is read only once its save has settled, by its stats alone. */
import { setTimeout as sleep } from "node:timers/promises";
import type { Remedy } from "../refusal.js";
import { readStat } from "./change-detection.js";
import type { FileStat } from "./index-schema.js";

/**
 * A file modified more recently than this settles before it is read, and an empty one this young waits: past the
 * longest window an editor's save was seen to leave a file empty.
 */
export const SETTLE_WINDOW_NS = 50_000_000n;
/** The gap between a settle check's two stats, past Linux's 10 ms modification-time tick. */
export const SETTLE_INTERVAL_MS = 15;
/** How many settle checks a file gets before it waits for the next command. */
export const SETTLE_TRIES = 3;

/** The clock, stat, and sleep the gate runs on. */
export interface ReadGateDependencies {
  /** The wall clock in nanoseconds. */
  readonly now: () => bigint;
  /** An `lstat` read as bigints, null where nothing is there. */
  readonly stat: (path: string) => Promise<FileStat | null>;
  readonly sleep: (milliseconds: number) => Promise<void>;
}

/** The wall clock in nanoseconds, the scale a file's modification time is read in. */
export function wallClockNs(): bigint {
  return BigInt(Date.now()) * 1_000_000n;
}

/** The system's clock, `lstat`, and timer. */
export const SYSTEM_READ_GATE: ReadGateDependencies = {
  now: wallClockNs,
  stat: (path) => readStat(path),
  sleep: async (milliseconds) => { await sleep(milliseconds); },
};

/** What the gate found at a path the index lists. */
export type ReadGateVerdict =
  /** Settled: read it, at this stat. */
  | { readonly kind: "read"; readonly stat: FileStat }
  /** Empty and young, or still changing after every try: deferred, for the caller to mark pending for the next command. */
  | { readonly kind: "pending"; readonly reason: "empty" | "unsettled" }
  /**
   * A deleted file, no edit and never pending, replaced when a refresh next writes it: an emptied Markdown file, which
   * every projected one carries its stamp against, or anything not a file, never followed or read, which is reported.
   */
  | { readonly kind: "no-edit"; readonly deleted: "emptied" }
  | { readonly kind: "no-edit"; readonly deleted: "not-a-file"; readonly remedy: Remedy }
  /** Nothing at the path. */
  | { readonly kind: "absent" };

/** The file the gate reads: its absolute path, and whether it is Markdown, which carries a stamp. */
export interface GatedFile {
  readonly path: string;
  readonly markdown: boolean;
}

/**
 * Gate a read of a projected file. A file modified within the settle window is read only once two stats a settle
 * interval apart agree on its size and modification time, else it waits for the next command.
 * @param file - The file to read.
 * @param deps - The clock, stat, and sleep, the system's unless a caller injects its own.
 * @returns What the gate found.
 */
export async function gateRead(file: GatedFile, deps: ReadGateDependencies = SYSTEM_READ_GATE): Promise<ReadGateVerdict> {
  let stat = await deps.stat(file.path);
  for (let tries = 0; tries < SETTLE_TRIES; tries += 1) {
    const verdict = classify(file, stat, deps.now());
    if (verdict !== "unsettled") return verdict;
    await deps.sleep(SETTLE_INTERVAL_MS);
    const next = await deps.stat(file.path);
    // Agreement settles the save; the stat it agrees on is no longer deferred for its age.
    if (stat !== null && next !== null && stat.size === next.size && stat.mtimeNs === next.mtimeNs) {
      return settledVerdict(file, next);
    }
    stat = next;
  }
  const verdict = classify(file, stat, deps.now());
  return verdict === "unsettled" ? { kind: "pending", reason: "unsettled" } : verdict;
}

/** What a stat says of the file at its age: a file modified within the settle window waits, or settles first. */
function classify(file: GatedFile, stat: FileStat | null, now: bigint): ReadGateVerdict | "unsettled" {
  if (stat?.type === "file" && now - stat.mtimeNs < SETTLE_WINDOW_NS) {
    // An editor that truncates before writing leaves the file empty mid-save, so an empty young file is never read.
    return stat.size === 0n ? { kind: "pending", reason: "empty" } : "unsettled";
  }
  return settledVerdict(file, stat);
}

/** What a stat alone says of the file once its age no longer defers it. */
function settledVerdict(file: GatedFile, stat: FileStat | null): ReadGateVerdict {
  if (stat === null) return { kind: "absent" };
  if (stat.type !== "file") return { kind: "no-edit", deleted: "not-a-file", remedy: notAFileRemedy(file.path) };
  // Every projected Markdown file carries its stamp, so one emptied for longer than a save takes was deleted.
  if (stat.size === 0n && file.markdown) return { kind: "no-edit", deleted: "emptied" };
  return { kind: "read", stat };
}

function notAFileRemedy(path: string): Remedy {
  return { text: `Replace ${path} with a regular file; a projected path that is not one is never followed or read.` };
}
