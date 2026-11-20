/**
 * The sweep: every command, under the projection lock and before write-back reads a file, takes over the aside copies and
 * staged files a writer that has exited left, so a stop mid-swap loses no save.
 */
import { removeProjectionAsideFile, removeRecoveredAsideFile, removeReturnedAsideFile, pruneAsideScaffold } from "./aside-cleanup.js";
import { withProjectionEntry } from "./index-memory.js";
import { loadProjectionGroups } from "./index-memory.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isAdvisoryHolderAbandoned, type AdvisoryHolderObserver } from "../../advisory-lock.js";
import { parseAsideFile, processScopeDigest, type AsideFile, type AsideWriterInput } from "./aside.js";
import { walkProjectionAsideFolder } from "./aside-discovery.js";
import { hasPathMovedOn, readPathHolding, restoreCopyRendering, settleAsideCopy, type CopySettlement } from "./aside-copies.js";
import { retriedMoves, type SwapMoves } from "./aside-moves.js";
import { storedBlobId, type ObjectFormat } from "./blob-id.js";
import { checkIgnores, type IgnoreCheck } from "./ignore-check.js";
import { recordProjectionIgnoreCheck } from "./ignore-record.js";
import { guardedProjectionRoots, type ProjectionIgnoreGuardInput } from "./ignore-guard.js";
import type { ConfiguredIgnoreRules } from "./configuration.js";
import { readReference, readStat } from "./change-detection.js";
import { commitReturnedCopies } from "./returned-copies.js";
import type { AsideCopyRecord, ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { ArchiveChangeRefusal } from "./archive-selection.js";
import type { ProjectionLocation } from "./location.js";
import { PROJECTION_ASIDE_ROOT } from "./paths.js";
import { notAFileRemedy, type ReadGateDependencies } from "./read-gate.js";
import type { Remedy } from "../refusal.js";
import { deleteAsideCopy, finalizeAsideCopy } from "./stampless.js";
import type { TakeInPort } from "./take-in-port.js";
import { readProjectionLinkBoundary, projectionLinkRemedy, type ProjectionLinkBoundary } from "./discovery-links.js";
import { ArchiveDestinationBlocked, archiveDestinationRefusal } from "./archive-file.js";

/** What the sweep reads, run under the worktree's projection lock; its moves are the system's unless a test injects its own. */
export interface SweepInput extends SwapMoves {
  readonly location: ProjectionLocation;
  readonly checkout: string;
  /** The index, null where the checkout holds none a command can use. */
  readonly index: ProjectionIndex | null;
  /** Recovery metadata from a valid header whose partitions cannot be used. */
  readonly withheldCopies?: readonly string[];
  readonly format: ObjectFormat;
  readonly takeIn: TakeInPort;
  /** The sweeping process: it judges each writer's liveness and names any copy it makes in turn. */
  readonly writer: AsideWriterInput;
  /** The command's one answer for whether an archive path is this checkout's, reported once; asked here where absent. */
  readonly selectArchivePath?: (path: string) => RefusedMark | null;
  /** Takes a refusal met just before a change, which the command keeps as that path's answer and reports once. */
  readonly refuseChange?: ArchiveChangeRefusal;
  /** The ignore guard's Git and file-system boundaries, over this checkout. */
  readonly guard: ProjectionIgnoreGuardInput;
  /** The ignore rules from this command's one configuration read. */
  readonly ignoreRules: ConfiguredIgnoreRules;
  readonly readIgnoreRules: () => Promise<ConfiguredIgnoreRules>;
  /** Observed link destinations are opaque, including when a retained copy names a descendant. */
  readonly blockedByLink?: ProjectionLinkBoundary;
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
  /** Why the copy remains untouched, including a destination outside the command's authorized roots. */
  readonly reason: "other-scope" | "unrecorded" | "withheld" | "not-a-file" | "root-not-authorized" | "destination-blocked";
  readonly remedy?: Remedy;
  /** For a destination-blocked copy, the path check's refusal, which the command keeps as its path's answer. */
  readonly refusal?: RefusedMark;
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
  if (input.index !== null) loadProjectionGroups(input.index, "walked");
  const reference = await readReference(input.checkout);
  const guarded = guardedProjectionRoots(input.guard.identity).map(({ path }) => path);
  const ignores = await checkIgnores({
    guard: input.guard, records: input.index?.ignoreFiles ?? null, reference, format: input.format,
    ignoreRules: input.ignoreRules, readIgnoreRules: input.readIgnoreRules,
    recordedGuard: input.index?.ignoreGuard ?? null,
  });
  const writable = writableUnder(ignores, guarded);
  // A refusal of the aside folder, as a failed call refuses every root, leaves the sweep nothing it may write.
  if (!writable(`${PROJECTION_ASIDE_ROOT}/`)) return { ignores, index: input.index, swept: [], left: [], withheld: [], copies: [] };
  const found = await listAsideFolder(input.checkout, input.checkpoint);
  const destinations = [
    ...Object.entries(input.index?.entries ?? {}).flatMap(([path, entry]) => entry.kind === "record" && entry.copies.length > 0 ? [path] : []),
    ...found.flatMap(copy => { const named = parseAsideFile(copy); return named?.role === "aside" ? [named.path] : []; }),
  ];
  const observed = await readProjectionLinkBoundary(input.checkout, destinations.filter(writable));
  const judges: SweepJudges = { writerOf: judgeWriters(input), writable,
    blockedByLink: path => input.blockedByLink?.(path) ?? observed(path) };
  if (input.index === null) return { ignores, ...await sweepWithoutIndex(input, found, judges) };
  const recorded = await takeOverRecorded(input, input.index, judges);
  const unrecorded = await takeOverUnrecorded(input, recorded.index, found, judges);
  await deleteStagedFiles(input, found, judges.writerOf);
  const observedIndex = recordProjectionIgnoreCheck(releaseDeletedWithheldCopies(recorded.index, found), ignores);
  const index = recorded.swept.length === 0 ? observedIndex : await commitReturnedCopies({
    location: input.location, checkout: input.checkout, checkpoint: input.checkpoint,
    returned: recorded.swept.filter(each => each.outcome.kind === "returned" || each.outcome.kind === "linked-back")
      .map(({ path, copy }) => ({ path, copy })), index: observedIndex, refuseChange: input.refuseChange,
  });
  const copies = recorded.swept.flatMap(({ path, outcome }) => (
    outcome.kind === "returned" && outcome.replacement !== null ? [{ path, copy: outcome.replacement }] : []
  ));
  return { ignores, index, swept: recorded.swept, left: [...recorded.left, ...unrecorded], withheld: [], copies };
}

/** A withheld copy the person deleted is released: its name leaves the list once the aside folder no longer holds it. */
function releaseDeletedWithheldCopies(index: ProjectionIndex, found: readonly string[]): ProjectionIndex {
  const kept = index.withheldCopies.filter(copy => found.includes(copy));
  return kept.length === index.withheldCopies.length ? index : { ...index, withheldCopies: kept };
}

/** How the sweep judges each copy: whether its writer has exited, and whether its path's root may be written. */
interface SweepJudges {
  readonly writerOf: (name: string) => WriterState;
  readonly writable: (path: string) => boolean;
  readonly blockedByLink: ProjectionLinkBoundary;
}

/** Admit a copy destination before any read or restoration can traverse its path. */
function destinationRefusal(path: string, copy: string, judges: SweepJudges): LeftCopy | null {
  const link = judges.blockedByLink(path);
  if (link !== null) return { path, copy, reason: "not-a-file", remedy: projectionLinkRemedy(link) };
  return judges.writable(path) ? null : unauthorizedCopy(path, copy);
}

/** Only proved roots may be written; a passing current-identity guard never authorizes another personal root. */
export function writableUnder(ignores: IgnoreCheck, guarded: readonly string[]): (path: string) => boolean {
  const refused = ignores.kind !== "refused" ? []
    : ignores.reason === "guard-failed" ? ignores.paths : ignores.roots.map((root) => root.path);
  const authorized = guarded.filter((root) => !refused.includes(root));
  return (path) => authorized.some((root) => path.startsWith(root));
}

/** Retain an unproved destination's copy with the route back to ordinary recovery. */
function unauthorizedCopy(path: string, copy: string): LeftCopy {
  return { path, copy, reason: "root-not-authorized", remedy: {
    text: `Recovery did not touch ${copy}: ${path} is outside the authorized roots. Restore the root's ignore rule and, for a personal path, run with that ARC identity before retrying.`,
  } };
}

/** Each copy the index records, in each entry's record order, taken over where its writer has exited. */
async function takeOverRecorded(
  input: SweepInput, initial: ProjectionIndex, judges: SweepJudges,
): Promise<{ index: ProjectionIndex; swept: SweepResult["swept"]; left: LeftCopy[] }> {
  const { taking, left } = recordsToTake(initial, judges);
  let index = initial;
  const swept: { path: string; copy: string; outcome: SweptCopy }[] = [];
  // The sweep asks whether each archive path is this checkout's once, before it takes over any of the path's copies.
  const selection = new Map<string, RefusedMark | null>();
  const select = input.selectArchivePath ?? ((path: string) => {
    if (!selection.has(path)) selection.set(path, archiveDestinationRefusal(input.checkout, path));
    return selection.get(path) ?? null;
  });
  for (const { path, copy } of taking) {
    const current = index.entries[path];
    const record = current?.kind === "record" ? current.copies.find((record) => record.name === copy) : undefined;
    if (current?.kind !== "record" || record === undefined) continue;
    const refused = select(path);
    const outcome: SweptCopy = refused === null ? await sweepCopy(input, path, current, record)
      : { kind: "blocked-destination", entry: current, mark: refused };
    index = withProjectionEntry(index, path, outcome.entry);
    swept.push({ path, copy: record.name, outcome });
  }
  return { index, swept, left };
}

/**
 * The recorded copies the sweep takes over: those under a root it may write whose writer has exited, never one withheld
 * when an index was rebuilt, which stays until the person deletes it. One from another process scope is reported.
 */
function recordsToTake(
  index: ProjectionIndex, judges: SweepJudges,
): { taking: { path: string; copy: string }[]; left: LeftCopy[] } {
  const { writerOf } = judges;
  const taking: { path: string; copy: string }[] = [];
  const left: LeftCopy[] = [];
  for (const [path, entry] of Object.entries(index.entries)) {
    if (entry.kind !== "record") continue;
    for (const record of entry.copies.filter((copy) => !index.withheldCopies.includes(copy.name))) {
      const refusal = destinationRefusal(path, record.name, judges);
      if (refusal !== null) { left.push(refusal); continue; }
      const writer = writerOf(record.name);
      if (writer === "other-scope") left.push({ path, copy: record.name, reason: "other-scope" });
      if (writer === "exited") taking.push({ path, copy: record.name });
    }
  }
  return { taking, left };
}

/**
 * Each copy in the aside folder the index neither records nor withholds — a replacement a stop left before its swap back
 * was written, say — deleted where it holds no edit, and otherwise kept and reported with its path.
 */
async function takeOverUnrecorded(
  input: SweepInput, index: ProjectionIndex, found: readonly string[], judges: SweepJudges,
): Promise<LeftCopy[]> {
  const { writerOf } = judges;
  const recorded = new Set(Object.values(index.entries).flatMap((entry) => (
    entry.kind === "record" ? entry.copies.map((copy) => copy.name) : []
  )));
  const left: LeftCopy[] = [];
  for (const location of found) {
    const named = parseAsideFile(location);
    if (named?.role !== "aside" || recorded.has(location) || index.withheldCopies.includes(location)) continue;
    const refusal = destinationRefusal(named.path, location, judges);
    if (refusal !== null) { left.push(refusal); continue; }
    const writer = writerOf(location);
    if (writer === "other-scope") left.push({ path: named.path, copy: location, reason: "other-scope" });
    if (writer === "exited") {
      const retained = await deleteIfUnedited(input, location, named);
      if (retained !== null) left.push(retained);
    }
  }
  return left;
}

/**
 * With no usable index the sweep takes nothing in: a regular copy whose path is absent is linked back, a symbolic
 * link or file equal to its base is deleted, and every other stays, withheld and reported with its path.
 */
async function sweepWithoutIndex(
  input: SweepInput, found: readonly string[], judges: SweepJudges,
): Promise<Omit<SweepResult, "ignores">> {
  const { writerOf } = judges;
  const left: LeftCopy[] = [];
  for (const location of found) {
    const named = parseAsideFile(location);
    if (named?.role !== "aside") continue;
    if (input.withheldCopies?.includes(location)) {
      left.push(await retainedCopy(input.checkout, named.path, location, "withheld"));
      continue;
    }
    const refusal = destinationRefusal(named.path, location, judges);
    if (refusal !== null) {
      left.push(refusal);
      continue;
    }
    const writer = writerOf(location);
    if (writer === "other-scope") left.push({ path: named.path, copy: location, reason: "other-scope" });
    if (writer !== "exited") continue;
    const retained = await returnWithoutIndex(input, location, named);
    if (retained !== null) left.push(retained);
  }
  await deleteStagedFiles(input, found, writerOf);
  const withheld = left.filter(copy => copy.reason === "withheld" || copy.reason === "not-a-file").map(copy => copy.copy);
  return { index: null, swept: [], left, withheld, copies: [] };
}

/** Link a copy back to its absent path, or retain it when its destination or contents prevent recovery. */
async function returnWithoutIndex(input: SweepInput, location: string, named: AsideFile): Promise<LeftCopy | null> {
  const refusal = archiveDestinationHold(input.checkout, named.path, location);
  if (refusal !== null) return refusal;
  const at = { copy: join(input.checkout, location), path: join(input.checkout, named.path) };
  const isFile = (await readStat(at.copy))?.type === "file";
  if (isFile && await readStat(at.path) === null) {
    try {
      if (await retriedMoves(input, { checkout: input.checkout, path: named.path }).linkOnto(at.copy, at.path)) {
        const outcome = await removeReturnedAsideFile(input.checkout, location, named.path, input.checkpoint);
        return outcome === "retained" ? await retainedCopy(input.checkout, named.path, location, "withheld") : null;
      }
    } catch (error) {
      if (error instanceof ArchiveDestinationBlocked) return destinationBlockedCopy(named.path, location, error.mark);
      throw error;
    }
  }
  return deleteUneditedCopy(input, location, named, "withheld");
}

/** Delete a symbolic link or a file equal to its base; retain directories and edits with their contents. */
async function deleteIfUnedited(input: SweepInput, location: string, named: AsideFile): Promise<LeftCopy | null> {
  return archiveDestinationHold(input.checkout, named.path, location) ?? deleteUneditedCopy(input, location, named, "unrecorded");
}

/** Delete an unedited copy of a path this sweep already selected; the deletion asks again just before it unlinks. */
async function deleteUneditedCopy(input: SweepInput, location: string, named: AsideFile,
  reason: "unrecorded" | "withheld"): Promise<LeftCopy | null> {
  const copy = join(input.checkout, location);
  const stat = await readStat(copy);
  if (stat === null) return null;
  if (stat.type === "other") return retainedCopy(input.checkout, named.path, location, reason);
  const unedited = stat.type !== "file"
    || storedBlobId(await readFile(copy, "utf8"), { format: input.format, markdown: named.path.endsWith(".md") }) === named.base;
  if (!unedited) return retainedCopy(input.checkout, named.path, location, reason);
  try {
    await removeRecoveredAsideFile(input.checkout, location, named.path, input.checkpoint);
    return null;
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return destinationBlockedCopy(named.path, location, error.mark);
    throw error;
  }
}

function archiveDestinationHold(checkout: string, path: string, copy: string): LeftCopy | null {
  const mark = archiveDestinationRefusal(checkout, path);
  return mark === null ? null : destinationBlockedCopy(path, copy, mark);
}

function destinationBlockedCopy(path: string, copy: string, mark: RefusedMark): LeftCopy {
  return { path, copy, reason: "destination-blocked", remedy: mark.remedy, refusal: mark };
}

/** Delete the staged files a writer that has exited left. */
async function deleteStagedFiles(
  input: SweepInput, found: readonly string[], writerOf: (name: string) => WriterState,
): Promise<void> {
  for (const location of found) {
    if (parseAsideFile(location)?.role === "staged" && writerOf(location) === "exited") {
      await input.checkpoint?.();
      await removeProjectionAsideFile(input.checkout, location, input.checkpoint);
    }
  }
}

/**
 * Take one copy over. A record whose copy is gone is dropped; a symbolic link is deleted as itself, a directory is
 * retained, and a regular copy whose path is absent and has not moved on is linked back there.
 */
async function sweepCopy(input: SweepInput, path: string, entry: RecordEntry, record: AsideCopyRecord): Promise<SweptCopy> {
  const { checkout } = input;
  const at = { copy: join(checkout, record.name), path: join(checkout, path) };
  const stat = await readStat(at.copy);
  // Moved back to its path, or never made after a stop.
  if (stat === null) return { kind: "dropped", entry: await finalizeAsideCopy({ checkout, path, entry, copy: record.name }) };
  try {
    const holding = await readPathHolding(checkout, path, input.format);
    if (stat.type === "symlink") {
      const deleted = await deleteAsideCopy({ checkout, path, entry, copy: record.name, checkpoint: input.checkpoint });
      // An absent path waits for the next refresh to rebuild it.
      return { kind: "deleted", entry: holding.kind === "absent" ? { ...deleted, pending: true } : deleted };
    }
    if (stat.type === "file" && holding.kind === "absent" && !hasPathMovedOn(record, holding)
      && await retriedMoves(input, { checkout, path }).linkOnto(at.copy, at.path)) {
      return { kind: "linked-back", entry: { ...restoreCopyRendering(entry, record), pending: true } };
    }
  } catch (error) {
    if (error instanceof ArchiveDestinationBlocked) return { kind: "blocked-destination", entry, mark: error.mark };
    throw error;
  }
  // Every other copy, and one whose path reappeared before its link, is settled as any aside copy is.
  const { format, takeIn, writer, fs, retrySleep, gate } = input;
  return settleAsideCopy({ checkout, path, entry, copy: record, format, takeIn, writer, fs, retrySleep, gate, checkpoint: input.checkpoint });
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
async function listAsideFolder(checkout: string, checkpoint?: () => Promise<void>): Promise<string[]> {
  const found: string[] = [];
  for await (const visit of walkProjectionAsideFolder(checkout)) {
    if (visit.kind === "copy") found.push(visit.location);
    else await pruneAsideScaffold(checkout, visit.location, checkpoint);
  }
  return found;
}

/** Report retained directories with their repair route, without deleting their contents. */
async function retainedCopy(checkout: string, path: string, copy: string, reason: "unrecorded" | "withheld"): Promise<LeftCopy> {
  const absolute = join(checkout, copy);
  return (await readStat(absolute))?.type === "other"
    ? { path, copy, reason: "not-a-file", remedy: notAFileRemedy(absolute) }
    : { path, copy, reason };
}
