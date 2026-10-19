/** Source identities and per-source accounting for the pure review import. */
import type { ReviewMappingInput, ReviewMappingResult, ReviewMappingWorkItem } from "./mapping-types.js";
import type { RecordReference } from "../../identity.js";
import { resolveCandidateRecordRelativePath, resolveSubmissionBoundaryPath } from "./paths.js";

/** One supplied source, or one leftover materialization covering its descendants. */
export type ReviewMappingSource =
  | { kind: "gate"; source: string; bytes: Uint8Array }
  | { kind: "materialization"; source: string }
  | { kind: "candidate"; source: string; workItem: ReviewMappingWorkItem; commit: string; content: string }
  | { kind: "boundary"; source: string; workItem: ReviewMappingWorkItem; content: string };

function gateSources(files: ReviewMappingInput["gate"]): ReviewMappingSource[] {
  const sources: ReviewMappingSource[] = [];
  const folders = new Set<string>();
  for (const { path, bytes } of files) {
    const folder = /^arc\/review-gate\/materializations\/[^/]+\//u.exec(path)?.[0];
    if (folder === undefined) sources.push({ kind: "gate", source: path, bytes });
    else if (!folders.has(folder)) {
      sources.push({ kind: "materialization", source: folder });
      folders.add(folder);
    }
  }
  return sources;
}

/** Enumerate the supplied gate files and tracked review records under their import source identities. */
export function collectReviewMappingSources(input: ReviewMappingInput): ReviewMappingSource[] {
  const sources = gateSources(input.gate);
  for (const candidate of input.candidates) {
    const workItem = input.workItems.find((row) => row.uid === candidate.workItem);
    if (workItem === undefined || workItem.kind !== "work-unit") continue;
    const path = resolveCandidateRecordRelativePath(workItem.slug);
    for (const version of candidate.versions) {
      sources.push({ kind: "candidate", source: `${path}@${version.commit}`, workItem, ...version });
    }
    if (candidate.boundary !== null) {
      sources.push({ kind: "boundary", source: resolveSubmissionBoundaryPath(workItem.slug), workItem,
        content: candidate.boundary });
    }
  }
  return sources;
}

/** Summarize one file's produced records and the entries that it leaves behind. */
export function reviewMappingListingEntry(input: {
  source: string;
  records: readonly RecordReference[];
  leftBehind: readonly string[];
  inFlight?: string;
}): ReviewMappingResult["listing"][number] {
  if (input.inFlight !== undefined) {
    return { source: input.source, outcome: "in-flight", reason: input.inFlight, records: [] };
  }
  if (input.records.length === 0) {
    return { source: input.source, outcome: "left-behind", records: [],
      reason: input.leftBehind.join("; ") || "No portable review facts were produced." };
  }
  return { source: input.source, outcome: "mapped", records: [...input.records],
    ...(input.leftBehind.length === 0 ? {} : { reason: `Left behind: ${input.leftBehind.join("; ")}` }) };
}
