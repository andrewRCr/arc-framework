/**
 * The sweep: every command, under the projection lock and before write-back reads a file, takes over the aside copies and
 * staged files a writer that has exited left, so a stop mid-swap loses no save.
 */
import { readdir, readFile, rm } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { isAdvisoryHolderAbandoned, type AdvisoryHolderObserver } from "../../advisory-lock.js";
import { ASIDE_FILES_ROOT, parseAsideFile, processScopeDigest, type AsideFile, type AsideWriterInput } from "./aside.js";
import { hasPathMovedOn, readPathHolding, settleAsideCopy, type CopySettlement } from "./aside-copies.js";
import { retriedMoves, type SwapMoves } from "./aside-moves.js";
import { storedBlobId, type ObjectFormat } from "./blob-id.js";
import { checkIgnores, type IgnoreCheck } from "./ignore-check.js";
import type { ProjectionIgnoreGuardInput } from "./ignore-guard.js";
import { readReference, readStat } from "./change-detection.js";
import { commitProjectionIndex } from "./index-file.js";
import type { AsideCopyRecord, ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionLocation } from "./location.js";
import { PROJECTION_ASIDE_ROOT } from "./paths.js";
import type { ReadGateDependencies } from "./read-gate.js";
import { deleteAsideCopy } from "./stampless.js";
import type { TakeInPort } from "./take-in-port.js";

/** What the sweep reads, run under the worktree's projection lock; its moves are the system's unless a test injects its own. */
export interface SweepInput extends SwapMoves {
  readonly location: ProjectionLocation;
  readonly checkout: string;
  /** The index, null where the checkout holds none a command can use. */
  readonly index: ProjectionIndex | null;
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  /** The sweeping process: it judges each writer's liveness and names any copy it makes in turn. */
  readonly writer: AsideWriterInput;
  /** The ignore guard's Git and file-system boundaries, over this checkout. */
  readonly guard: ProjectionIgnoreGuardInput;
  /** Whether a process ID is in use, the system's unless a test injects its own. */
  readonly isProcessAlive?: (pid: number) => boolean;
  /** The read gate every copy check runs on, the system's unless a test injects its own. */
  readonly gate?: ReadGateDependencies;
}

/** What became of one copy the sweep took over. */
export type SweptCopy =
  | CopySettlement
  /** Its path was absent and had not moved on: linked back there, the file pending. */
  | { readonly kind: "linked-back"; readonly entry: RecordEntry };

/** A copy the sweep left in the aside folder and reports with its path. */
export interface LeftCopy {
  readonly path: string;
  readonly copy: string;
  /** Written from another process scope; with no record of it; or, with no usable index, holding an edit. */
  readonly reason: "other-scope" | "unrecorded" | "withheld";
}

/** What the sweep did. */
export interface SweepResult {
  /** The ignore check its first write follows; a refusal leaves each root it names unwritten for the command. */
  readonly ignores: IgnoreCheck;
  /** The index as the sweep left it, null where none is usable. */
  readonly index: ProjectionIndex | null;
  readonly swept: readonly { readonly path: string; readonly copy: string; readonly outcome: SweptCopy }[];
  readonly left: readonly LeftCopy[];
  /** With no usable index, the copies that stay, for the index that is rebuilt to record as withheld. */
  readonly withheld: readonly string[];
  /** The copies the sweep made in turn, each a replacement a swap back moved aside, for the command's second check. */
  readonly copies: readonly { readonly path: string; readonly copy: string }[];
}

/**
 * Sweep the aside folder.
 * @param input - The checkout, its index, and how to take an edit in.
 * @returns What the sweep did.
 */
export async function sweepAsideFolder(input: SweepInput): Promise<SweepResult> {
  const reference = await readReference(input.checkout);
  const ignores = await checkIgnores({ guard: input.guard, records: input.index?.ignoreFiles ?? null, reference, format: input.format });
  const writable = writableUnder(ignores);
  // A refusal of the aside folder, as a failed call refuses every root, leaves the sweep nothing it may write.
  if (!writable(`${PROJECTION_ASIDE_ROOT}/`)) return { ignores, index: input.index, swept: [], left: [], withheld: [], copies: [] };
  const judges: SweepJudges = { writerOf: judgeWriters(input), writable };
  const found = await listAsideFolder(input.checkout);
  if (input.index === null) return { ignores, ...await sweepWithoutIndex(input, found, judges) };
  const recorded = await takeOverRecorded(input, input.index, judges);
  const unrecorded = await takeOverUnrecorded(input, recorded.index, found, judges);
  await deleteStagedFiles(input.checkout, found, judges.writerOf);
  const index = await commitProjectionIndex({
    location: input.location, checkout: input.checkout, index: { ...recorded.index, ignoreFiles: ignoreFilesAfter(ignores, recorded.index) },
    recorded: { entries: new Set<string>(), ignoreFiles: ignores.kind === "passed" },
  });
  const copies = recorded.swept.flatMap(({ path, outcome }) => (
    outcome.kind === "returned" && outcome.replacement !== null ? [{ path, copy: outcome.replacement }] : []
  ));
  return { ignores, index, swept: recorded.swept, left: [...recorded.left, ...unrecorded], withheld: [], copies };
}

/** What the index records of the ignore files: a pass's records, none after a refusal, else what it held. */
function ignoreFilesAfter(ignores: IgnoreCheck, index: ProjectionIndex): ProjectionIndex["ignoreFiles"] {
  if (ignores.kind === "passed") return [...ignores.records];
  return ignores.kind === "refused" ? null : index.ignoreFiles;
}

/** How the sweep judges each copy: whether its writer has exited, and whether its path's root may be written. */
interface SweepJudges {
  readonly writerOf: (name: string) => WriterState;
  readonly writable: (path: string) => boolean;
}

/** Whether a path lies outside every root a refusal names. */
function writableUnder(ignores: IgnoreCheck): (path: string) => boolean {
  if (ignores.kind !== "refused") return () => true;
  const refused = ignores.reason === "guard-failed" ? ignores.paths : ignores.roots.map((root) => root.path);
  return (path) => !refused.some((root) => path.startsWith(root));
}

/** Each copy the index records, in each entry's record order, taken over where its writer has exited. */
async function takeOverRecorded(
  input: SweepInput, initial: ProjectionIndex, judges: SweepJudges,
): Promise<{ index: ProjectionIndex; swept: SweepResult["swept"]; left: LeftCopy[] }> {
  const { taking, left } = recordsToTake(initial, judges);
  let index = initial;
  const swept: { path: string; copy: string; outcome: SweptCopy }[] = [];
  for (const { path, record } of taking) {
    const current = index.entries[path];
    if (current?.kind !== "record") continue;
    const outcome = await sweepCopy(input, path, current, record);
    index = { ...index, entries: { ...index.entries, [path]: outcome.entry } };
    swept.push({ path, copy: record.name, outcome });
  }
  return { index, swept, left };
}

/**
 * The recorded copies the sweep takes over: those under a root it may write whose writer has exited, never one withheld
 * when an index was rebuilt, which stays until the person deletes it. One from another process scope is reported.
 */
function recordsToTake(
  index: ProjectionIndex, { writerOf, writable }: SweepJudges,
): { taking: { path: string; record: AsideCopyRecord }[]; left: LeftCopy[] } {
  const taking: { path: string; record: AsideCopyRecord }[] = [];
  const left: LeftCopy[] = [];
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record" || !writable(path)) continue;
    for (const record of entry.copies.filter((copy) => !index.withheldCopies.includes(copy.name))) {
      const writer = writerOf(record.name);
      if (writer === "other-scope") left.push({ path, copy: record.name, reason: "other-scope" });
      if (writer === "exited") taking.push({ path, record });
    }
  }
  return { taking, left };
}

/**
 * Each copy in the aside folder the index neither records nor withholds — a replacement a stop left before its swap back
 * was written, say — deleted where it holds no edit, and otherwise kept and reported with its path.
 */
async function takeOverUnrecorded(
  input: SweepInput, index: ProjectionIndex, found: readonly string[], { writerOf, writable }: SweepJudges,
): Promise<LeftCopy[]> {
  const recorded = new Set(Object.values(index.entries).flatMap((entry) => (
    entry.kind === "record" ? entry.copies.map((copy) => copy.name) : []
  )));
  const left: LeftCopy[] = [];
  for (const location of found) {
    const named = parseAsideFile(location);
    if (named?.role !== "aside" || !writable(named.path) || recorded.has(location) || index.withheldCopies.includes(location)) continue;
    const writer = writerOf(location);
    if (writer === "other-scope") left.push({ path: named.path, copy: location, reason: "other-scope" });
    if (writer === "exited" && !await deleteIfUnedited(input, location, named)) {
      left.push({ path: named.path, copy: location, reason: "unrecorded" });
    }
  }
  return left;
}

/**
 * With no usable index the sweep takes nothing in: a copy whose path is absent is linked back, one that is not a file
 * or equals its base, its stamp set aside, is deleted, and every other stays, withheld and reported with its path.
 */
async function sweepWithoutIndex(
  input: SweepInput, found: readonly string[], { writerOf, writable }: SweepJudges,
): Promise<Omit<SweepResult, "ignores">> {
  const left: LeftCopy[] = [];
  const withheld: string[] = [];
  for (const location of found) {
    const named = parseAsideFile(location);
    if (named?.role !== "aside" || !writable(named.path)) continue;
    const writer = writerOf(location);
    if (writer === "other-scope") left.push({ path: named.path, copy: location, reason: "other-scope" });
    if (writer !== "exited" || await returnWithoutIndex(input, location, named)) continue;
    withheld.push(location);
    left.push({ path: named.path, copy: location, reason: "withheld" });
  }
  await deleteStagedFiles(input.checkout, found, writerOf);
  return { index: null, swept: [], left, withheld, copies: [] };
}

/** Link a copy back to its absent path, or delete one that holds no edit; false where it holds one and stays. */
async function returnWithoutIndex(input: SweepInput, location: string, named: AsideFile): Promise<boolean> {
  const at = { copy: join(input.checkout, location), path: join(input.checkout, named.path) };
  const isFile = (await readStat(at.copy))?.type === "file";
  if (isFile && await readStat(at.path) === null && await retriedMoves(input).linkOnto(at.copy, at.path)) {
    await rm(at.copy, { force: true });
    return true;
  }
  return deleteIfUnedited(input, location, named);
}

/** Delete a copy that holds no edit — one not a file, or equal to its base, its stamp set aside; false where it holds one. */
async function deleteIfUnedited(input: SweepInput, location: string, named: AsideFile): Promise<boolean> {
  const copy = join(input.checkout, location);
  const stat = await readStat(copy);
  if (stat === null) return true;
  const unedited = stat.type !== "file"
    || storedBlobId(await readFile(copy, "utf8"), { format: input.format, markdown: named.path.endsWith(".md") }) === named.base;
  if (unedited) await rm(copy, { force: true });
  return unedited;
}

/** Delete the staged files a writer that has exited left. */
async function deleteStagedFiles(
  checkout: string, found: readonly string[], writerOf: (name: string) => WriterState,
): Promise<void> {
  for (const location of found) {
    if (parseAsideFile(location)?.role === "staged" && writerOf(location) === "exited") await rm(join(checkout, location), { force: true });
  }
}

/**
 * Take one copy over. A record whose copy is gone is dropped; a copy that is not a file is deleted as no edit, never
 * followed or linked back; and one whose path is absent and has not moved on is linked back there.
 */
async function sweepCopy(input: SweepInput, path: string, entry: RecordEntry, record: AsideCopyRecord): Promise<SweptCopy> {
  const { checkout } = input;
  const at = { copy: join(checkout, record.name), path: join(checkout, path) };
  const stat = await readStat(at.copy);
  // Moved back to its path, or never made after a stop.
  if (stat === null) return { kind: "dropped", entry: { ...entry, copies: entry.copies.filter((each) => each.name !== record.name) } };
  const holding = await readPathHolding(at.path, input.format);
  if (stat.type !== "file") {
    const deleted = await deleteAsideCopy({ checkout, path, entry, copy: record.name });
    // An absent path waits for the next refresh to rebuild it.
    return { kind: "deleted", entry: holding.kind === "absent" ? { ...deleted, pending: true } : deleted };
  }
  if (holding.kind === "absent" && !hasPathMovedOn(record, holding) && await retriedMoves(input).linkOnto(at.copy, at.path)) {
    await rm(at.copy, { force: true });
    return { kind: "linked-back", entry: { ...entry, pending: true, copies: entry.copies.filter((each) => each.name !== record.name) } };
  }
  // Every other copy, and one whose path reappeared before its link, is settled as any aside copy is.
  const { format, takeIn, writer, fs, retrySleep, gate } = input;
  return settleAsideCopy({ checkout, path, entry, copy: record, format, takeIn, writer, fs, retrySleep, gate });
}

/** How the sweep reads the writer a copy's or staged file's name records. */
type WriterState = "exited" | "running" | "other-scope";

/**
 * Judge the writer a name records by the rule the projection lock reclaims a holder by. A copy holds no lease, so one
 * from another process scope never reads as exited.
 */
function judgeWriters(input: SweepInput): (name: string) => WriterState {
  const { writer } = input;
  const scopeDigest = processScopeDigest(writer.processScope);
  const observer: AdvisoryHolderObserver = {
    pid: writer.pid, processInstance: writer.processInstance, processScope: scopeDigest, isProcessAlive: input.isProcessAlive,
  };
  return (name) => {
    const named = parseAsideFile(name)?.writer;
    // A name this projection did not give is never taken over.
    if (named === undefined) return "running";
    if (named.scopeDigest !== scopeDigest) return "other-scope";
    const holder = { pid: named.pid, processInstance: named.processInstance, processScope: named.scopeDigest };
    return isAdvisoryHolderAbandoned(holder, observer) ? "exited" : "running";
  };
}

/** Every copy and staged file in the aside folder, a symbolic link read as itself, by repository-relative location. */
async function listAsideFolder(checkout: string): Promise<string[]> {
  try {
    const found = await readdir(join(checkout, ASIDE_FILES_ROOT), { recursive: true, withFileTypes: true });
    return found.filter((each) => !each.isDirectory())
      .map((each) => relative(checkout, join(each.parentPath, each.name)).split(sep).join("/"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
