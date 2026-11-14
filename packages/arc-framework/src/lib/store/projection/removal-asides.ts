/** Observe saved edits in swap order without settling, returning, or deleting their copies. */
import { checkAsideCopy, observeAsideCopy, recordWriteBackSent } from "./aside-copies.js";
import { readProjectionLinkBoundary, type ProjectionLinkBoundary, type ProjectionLinkFs } from "./discovery-links.js";
import type { ProjectionRemovalGuard, ProjectionRemovalObservationInput } from "./removal-observations.js";
import { readProjectionProtection } from "./protection.js";
import { projectionFeasibilityRefusal, type ProjectionRemovalCheck } from "./removal-verdict.js";
import type { AsideCopyRecord, RecordEntry, ProjectionIndex } from "./index-schema.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile, type AsideFile } from "./aside.js";
import { walkProjectionAsideFolder } from "./aside-discovery.js";
import { readStat } from "./change-detection.js";
import { storedBlobId, type ObjectFormat } from "./blob-id.js";

interface UnrecordedProjectionCopyInput {
  readonly checkout: string;
  readonly index: ProjectionIndex;
  readonly format: ObjectFormat;
  readonly linkFs?: ProjectionLinkFs;
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
  const boundary = await readProjectionLinkBoundary(root.checkout, [...paths, ...copies], input.ports.linkFs);
  for (const path of paths) {
    let entry = index.entries[path];
    if (entry?.kind !== "record") continue;
    for (const name of entry.copies.map(copy => copy.name)) {
      const checked = await checkRecordedCopy(input, path, entry, name, boundary);
      if (checked.verdict.kind !== "passes") return checked.verdict;
      entry = checked.entry;
    }
  }
  return checkUnrecordedProjectionCopies({ checkout: root.checkout, index, format: root.context.format, linkFs: input.ports.linkFs });
}

/** Refuse authored recovery files absent from the index before their containing folder can be removed. */
export async function checkUnrecordedProjectionCopies(input: UnrecordedProjectionCopyInput): Promise<Exclude<ProjectionRemovalCheck, { kind: "unobservable" }>> {
  const { checkout, index } = input;
  const boundary = await readProjectionLinkBoundary(checkout, [ASIDE_FILES_ROOT], input.linkFs);
  if (boundary(ASIDE_FILES_ROOT) !== null) return { kind: "passes" };
  const recorded = new Set(Object.values(index.entries).flatMap(entry => entry.kind === "record" ? entry.copies.map(copy => copy.name) : []));
  for await (const visit of walkProjectionAsideFolder(checkout)) {
    if (visit.kind !== "copy" || recorded.has(visit.location)) continue;
    const named = parseAsideFile(visit.location);
    if (named?.role !== "aside") continue;
    const links = await readProjectionLinkBoundary(checkout, [visit.location], input.linkFs);
    if (links(visit.location) !== null) continue;
    if (await unrecordedCopyIsUnchanged(input, visit.location, named)) continue;
    return { kind: "would-refuse", remedy: { text: `Recover anything wanted from ${visit.location}, then delete that copy and retry removal.` } };
  }
  return { kind: "passes" };
}

async function unrecordedCopyIsUnchanged(input: UnrecordedProjectionCopyInput, location: string, named: AsideFile): Promise<boolean> {
  const stat = await readStat(join(input.checkout, location));
  if (stat === null || stat.type === "symlink") return true;
  if (stat.type !== "file" || input.index.withheldCopies.includes(location)) return false;
  const content = await readFile(join(input.checkout, location), "utf8");
  return storedBlobId(content, { format: input.format, markdown: named.path.endsWith(".md") }) === named.base;
}

/** Check one recorded copy as persistence would meet it, carrying a predicted send's marks to the path's next copy. */
async function checkRecordedCopy(input: ProjectionRemovalAsidesInput, path: string, entry: RecordEntry, name: string,
  boundary: ProjectionLinkBoundary): Promise<{ entry: RecordEntry; verdict: ProjectionRemovalCheck }> {
  const copy = entry.copies.find(each => each.name === name);
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
  if (guarded.kind !== "would-refuse") return guarded;
  const denied = await readProjectionProtection({ store: root.store, checkout: root.checkout, identity: root.identity,
    exec: root.ports.exec, verb: root.context.verb }, entry.reference);
  return { kind: "would-refuse", remedy: denied?.remedy ?? guarded.remedy };
}

async function checkRemovalCopy(input: ProjectionRemovalObservationInput, path: string, entry: RecordEntry,
  copy: AsideCopyRecord, destinationLink: string | null): Promise<{ entry: RecordEntry; verdict: ProjectionRemovalCheck }> {
  const { root } = input;
  const refusal: { verdict: ProjectionRemovalCheck } = { verdict: { kind: "passes" } };
  const checked = await checkAsideCopy({ checkout: root.checkout, path, entry, copy,
    ...(destinationLink === null ? {} : { holding: { kind: "not-a-file" as const } }),
    format: root.context.format, takeIn: async request => {
      const prepared = await root.takeIn(request);
      refusal.verdict = projectionFeasibilityRefusal(prepared, copy.name) ?? { kind: "passes" };
      return prepared.kind === "ready" ? { answer: "taken-in", read: prepared.read,
        entry: recordWriteBackSent(request.entry, request.copy) } : { answer: "no-edit", entry: request.entry };
    } });
  if (refusal.verdict.kind !== "passes") return { entry, verdict: refusal.verdict };
  if (checked.kind === "not-a-file") return { entry, verdict: { kind: "would-refuse", remedy: checked.remedy } };
  if (checked.kind === "unsettled" || checked.kind === "empty") {
    return { entry, verdict: { kind: "would-refuse", remedy: { text: `Let ${copy.name} finish saving, then retry removal.` } } };
  }
  if (checked.kind === "moved-on") {
    return { entry, verdict: { kind: "would-refuse", remedy: { text: `Recover the edit in ${copy.name}, then delete that copy and retry removal.` } } };
  }
  return { entry: checked.entry, verdict: { kind: "passes" } };
}
