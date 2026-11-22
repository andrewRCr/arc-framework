/** Observe saved edits in swap order without settling, returning, or deleting their copies. */
import { checkAsideCopy, observeAsideCopy, recordWriteBackSent } from "./aside-copies.js";
import { readCopyDestinations, type ProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";
import type { ProjectionRemovalGuard, ProjectionRemovalObservationInput } from "./removal-observations.js";
import { readProjectionProtection } from "./protection.js";
import { markedRemovalRefusal, projectionFeasibilityRefusal, retirementName, unobservedMarkDetail, type ProjectionRemovalCheck,
  type ProjectionRetirement } from "./removal-verdict.js";
import type { AsideCopyRecord, RecordEntry, ProjectionIndex } from "./index-schema.js";
import { join } from "node:path";
import { parseAsideFile, type AsideFile } from "./aside.js";
import { archiveCopyLinkHold, readAsideStat, readAsideText, walkProjectionAsideFolder } from "./aside-discovery.js";
import type { ProjectionWalkFs } from "./engine-walk.js";
import { storedBlobId, type ObjectFormat } from "./blob-id.js";
import { selectArchivePath } from "./archive-selection.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { recordedCopyNames, uninspectedCopyScopes } from "./archive-copy-recovery.js";

interface UnrecordedProjectionCopyInput {
  readonly checkout: string;
  readonly index: ProjectionIndex;
  readonly format: ObjectFormat;
  readonly linkFs?: ProjectionLinkFs;
  readonly walkFs?: ProjectionWalkFs;
  readonly disposition: ProjectionRetirement;
}

/** The copy check shares the files check's guard, so both read one ignore answer. */
export interface ProjectionRemovalAsidesInput extends ProjectionRemovalObservationInput { readonly guard: ProjectionRemovalGuard }

/** Simulate only successful preparation's sequencing effect on later copies of the same path. */
export async function checkProjectionRemovalAsides(input: ProjectionRemovalAsidesInput): Promise<ProjectionRemovalCheck> {
  const { root, index } = input;
  const paths = Object.keys(index.entries).filter(path => {
    const entry = index.entries[path];
    return entry?.kind === "record" && entry.copies.length > 0;
  });
  const copies = paths.flatMap(path => {
    const entry = index.entries[path];
    return entry?.kind === "record" ? entry.copies.map(copy => copy.name) : [];
  });
  const { blockedByLink: boundary, archiveAccess } = await readCopyDestinations(root.checkout, [...paths, ...copies], input.ports.linkFs);
  const denied = archiveAccess.entries().next().value;
  if (denied !== undefined) return { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, denied[0], denied[1]) };
  for (const path of paths) {
    let entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    for (const name of entry.copies.map(copy => copy.name)) {
      const checked = await checkRecordedCopy(input, path, entry, name, boundary);
      if (checked.verdict.kind !== "passes") return checked.verdict;
      entry = checked.entry;
    }
  }
  return checkUnrecordedProjectionCopies({ checkout: root.checkout, index, format: root.context.format, linkFs: input.ports.linkFs,
    walkFs: input.ports.walkFs, disposition: input.disposition });
}

/** Refuse authored recovery files absent from the index before their containing folder can be removed. */
export async function checkUnrecordedProjectionCopies(input: UnrecordedProjectionCopyInput): Promise<ProjectionRemovalCheck> {
  const { checkout, index } = input;
  const recorded = recordedCopyNames(index);
  const known = [...recorded, ...index.withheldCopies, ...index.archiveRecoveryCopies ?? []];
  for await (const visit of walkProjectionAsideFolder(checkout, input.walkFs, input.linkFs)) {
    if (visit.kind === "uninspected") {
      const [path] = uninspectedCopyScopes(visit, index.archiveCopyPending ?? [], known, false);
      if (path !== undefined || visit.cause !== "link") {
        return { kind: "unobservable", detail: unobservedMarkDetail(checkout, path ?? visit.location, visit.mark) };
      }
      continue;
    }
    if (visit.kind !== "copy" || recorded.has(visit.location)) continue;
    const named = parseAsideFile(visit.location);
    if (named?.role !== "aside") continue;
    const check = await checkUnrecordedCopy(input, visit.location, named);
    if (check.kind !== "passes") return check;
  }
  return { kind: "passes" };
}

async function checkUnrecordedCopy(input: UnrecordedProjectionCopyInput, location: string, named: AsideFile): Promise<ProjectionRemovalCheck> {
  const { checkout } = input;
  const { blockedByLink, archiveAccess } = await readCopyDestinations(checkout, [location], input.linkFs);
  const link = blockedByLink(location);
  const hold = archiveAccess.get(named.path) ?? archiveCopyLinkHold(named.path, location, link);
  if (hold !== null) return { kind: "unobservable", detail: unobservedMarkDetail(checkout, named.path, hold) };
  try {
    if (link !== null || await unrecordedCopyIsUnchanged(input, location, named)) return { kind: "passes" };
  } catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    return { kind: "unobservable", detail: unobservedMarkDetail(checkout, named.path, error.mark) };
  }
  return { kind: "would-refuse", remedy: { text: `Recover anything wanted from ${location} in ${checkout}, then delete that copy and retry ${retirementName(input.disposition)}.` } };
}

async function unrecordedCopyIsUnchanged(input: UnrecordedProjectionCopyInput, location: string, named: AsideFile): Promise<boolean> {
  const copy = join(input.checkout, location);
  const stat = await readAsideStat(copy, named.path);
  if (stat === null || stat.type === "symlink") return true;
  if (stat.type !== "file" || input.index.withheldCopies.includes(location)) return false;
  const content = await readAsideText(copy, named.path);
  return storedBlobId(content, { format: input.format, markdown: named.path.endsWith(".md") }) === named.base;
}

/** Check one recorded copy as persistence would meet it, carrying a predicted send's marks to the path's next copy. */
async function checkRecordedCopy(input: ProjectionRemovalAsidesInput, path: string, entry: RecordEntry, name: string,
  boundary: ProjectionLinkBoundary): Promise<{ entry: RecordEntry; verdict: ProjectionRemovalCheck }> {
  const copy = entry.copies.find(each => each.name === name);
  const hold = archiveCopyLinkHold(path, name, boundary(name));
  if (hold !== null) return { entry, verdict: { kind: "unobservable", detail: unobservedMarkDetail(input.root.checkout, path, hold) } };
  if (boundary(name) !== null || copy === undefined) return { entry, verdict: { kind: "passes" } };
  const unauthorized = await checkUnauthorizedCopy(input, path, entry, copy);
  if (unauthorized === "unedited") return { entry, verdict: { kind: "passes" } };
  if (unauthorized !== "authorized") return { entry, verdict: unauthorized };
  return checkRemovalCopy(input, path, entry, copy, boundary(path));
}

/** Persistence never takes in a copy whose path or name its ignore guard refuses: it holds every copy it sees changed. */
async function checkUnauthorizedCopy(input: ProjectionRemovalAsidesInput, path: string, entry: RecordEntry,
  copy: AsideCopyRecord): Promise<ProjectionRemovalCheck | "authorized" | "unedited"> {
  const { root } = input;
  const guarded = [await input.guard(path), await input.guard(copy.name)].find(each => each.kind !== "passes");
  if (guarded === undefined) return "authorized";
  const observed = await observeAsideCopy({ checkout: root.checkout, path, entry, copy, format: root.context.format });
  if (observed.kind === "no-edit" || observed.kind === "gone") return "unedited";
  if (observed.kind === "blocked-destination")
    return { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, copy.name, observed.mark) };
  if (guarded.kind !== "would-refuse") return guarded;
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, entry.reference);
  return denied === null ? guarded : markedRemovalRefusal(root.checkout, copy.name, denied, input.disposition);
}

async function checkRemovalCopy(input: ProjectionRemovalObservationInput, path: string, entry: RecordEntry,
  copy: AsideCopyRecord, destinationLink: string | null): Promise<{ entry: RecordEntry; verdict: ProjectionRemovalCheck }> {
  const { root } = input;
  // An archive path this checkout does not own is left untouched, and leaves retirement unjudged.
  const blocked = selectArchivePath(root, path, { report: false });
  if (blocked !== null) return { entry, verdict: { kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, blocked) } };
  const refusal: { verdict: ProjectionRemovalCheck } = { verdict: { kind: "passes" } };
  const checked = await checkAsideCopy({ checkout: root.checkout, path, entry, copy,
    ...(destinationLink === null ? {} : { holding: { kind: "not-a-file" as const } }),
    format: root.context.format, takeIn: async request => {
      const prepared = await root.takeIn(request);
      refusal.verdict = projectionFeasibilityRefusal(prepared, root.checkout, copy.name, input.disposition) ?? { kind: "passes" };
      return prepared.kind === "ready" ? { answer: "taken-in", read: prepared.read,
        entry: recordWriteBackSent(request.entry, request.copy) } : { answer: "no-edit", entry: request.entry };
    } });
  if (refusal.verdict.kind !== "passes") return { entry, verdict: refusal.verdict };
  if (checked.kind === "blocked-destination") return { entry, verdict: {
    kind: "unobservable", detail: unobservedMarkDetail(root.checkout, path, checked.mark),
  } };
  if (checked.kind === "not-a-file") return { entry, verdict: { kind: "would-refuse", remedy: checked.remedy } };
  if (checked.kind === "unsettled") {
    return { entry, verdict: { kind: "would-refuse", remedy: { text: `Let ${copy.name} in ${root.checkout} finish saving, then retry ${retirementName(input.disposition)}.` } } };
  }
  if (checked.kind === "moved-on") {
    return { entry, verdict: { kind: "would-refuse", remedy: { text: `Recover the edit from ${copy.name} in ${root.checkout}, then delete that copy and retry ${retirementName(input.disposition)}.` } } };
  }
  return { entry: checked.entry, verdict: { kind: "passes" } };
}
