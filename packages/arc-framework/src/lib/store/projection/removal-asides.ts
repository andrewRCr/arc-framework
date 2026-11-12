/** Observe saved edits in swap order without settling, returning, or deleting their copies. */
import { checkAsideCopy, recordWriteBackSent } from "./aside-copies.js";
import { readProjectionLinkBoundary } from "./discovery-links.js";
import type { ProjectionRemovalObservationInput } from "./removal-observations.js";
import { projectionFeasibilityRefusal, type ProjectionRemovalCheck } from "./removal-verdict.js";
import type { AsideCopyRecord, RecordEntry } from "./index-schema.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ASIDE_FILES_ROOT, parseAsideFile } from "./aside.js";
import { walkProjectionAsideFolder } from "./aside-discovery.js";
import { readStat } from "./change-detection.js";
import { storedBlobId } from "./blob-id.js";

/** Simulate only successful preparation's sequencing effect on later copies of the same path. */
export async function checkProjectionRemovalAsides(input: ProjectionRemovalObservationInput): Promise<ProjectionRemovalCheck> {
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
      if (boundary(name) !== null) continue;
      const copy = entry.copies.find(copy => copy.name === name);
      if (copy === undefined) continue;
      const checked = await checkRemovalCopy(input, path, entry, copy, boundary(path));
      if (checked.verdict.kind !== "passes") return checked.verdict;
      entry = checked.entry;
    }
  }
  return checkUnrecordedCopies(input);
}

async function checkUnrecordedCopies(input: ProjectionRemovalObservationInput): Promise<ProjectionRemovalCheck> {
  const { root, index } = input;
  const boundary = await readProjectionLinkBoundary(root.checkout, [ASIDE_FILES_ROOT], input.ports.linkFs);
  if (boundary(ASIDE_FILES_ROOT) !== null) return { kind: "passes" };
  const recorded = new Set(Object.values(index.entries).flatMap(entry => entry.kind === "record" ? entry.copies.map(copy => copy.name) : []));
  for await (const visit of walkProjectionAsideFolder(root.checkout)) {
    if (visit.kind !== "copy" || recorded.has(visit.location)) continue;
    const named = parseAsideFile(visit.location);
    if (named?.role !== "aside") continue;
    const stat = await readStat(join(root.checkout, visit.location));
    if (stat === null || stat.type === "symlink") continue;
    if (stat.type === "file" && !index.withheldCopies.includes(visit.location)) {
      const content = await readFile(join(root.checkout, visit.location), "utf8");
      if (storedBlobId(content, { format: root.context.format, markdown: named.path.endsWith(".md") }) === named.base) continue;
    }
    return { kind: "would-refuse", remedy: { text: `Recover anything wanted from ${visit.location}, then delete that copy and retry removal.` } };
  }
  return { kind: "passes" };
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
