/** Replay accepted legacy Candidate versions without rewriting their complete content. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors, CandidateSupersessionResolutionError } from
  "../../../work-unit/candidate-attestation.js";
import type { CandidateManagedRecordV1 } from "./candidate/schema.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import { reviewMappingListingEntry } from "./mapping-listing.js";
import type { ReviewMappingResult } from "./mapping-types.js";

function candidateVersionReason(source: Extract<ReviewMappingSource, { kind: "candidate" }>,
  record: CandidateManagedRecordV1 | null, history: readonly CandidateManagedRecordV1[]): string | null {
  if (!source.workItem.live) return "No live work item owns this review fact.";
  if (record === null) return "Today's Candidate reader refuses this malformed version.";
  if (record.attestation.workUnit !== source.workItem.slug) return "Candidate version belongs to another work unit.";
  try { resolveCandidateSupersessionAncestors(record, history); }
  catch (error) {
    if (!(error instanceof CandidateSupersessionResolutionError)) throw error;
    return `Today's Candidate supersession reader refuses this version: ${error.message}`;
  }
  return null;
}

/** Keep accepted source bytes in chronological order and classify each refused version separately. */
export function mapReviewCandidateSources(sources: readonly ReviewMappingSource[]): {
  records: ReviewMappingResult["records"]; listing: ReviewMappingResult["listing"];
} {
  const histories = new Map<string, CandidateManagedRecordV1[]>();
  const groups = new Map<string, ReviewMappingResult["records"][number]>();
  const listing: ReviewMappingResult["listing"] = [];
  for (const source of sources) {
    if (source.kind !== "candidate") continue;
    const record = parseCandidateManagedRecord(source.content);
    const history = histories.get(source.workItem.uid) ?? [];
    const reason = candidateVersionReason(source, record, history);
    const leftBehind = reason === null ? [] : [reason];
    if (record !== null) { history.unshift(record); histories.set(source.workItem.uid, history); }
    let mapped = groups.get(source.workItem.uid);
    if (leftBehind.length === 0) {
      if (mapped === undefined) {
        mapped = { reference: recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item",
          name: source.workItem.slug, uid: source.workItem.uid })), contents: [] };
        groups.set(source.workItem.uid, mapped);
      }
      mapped.contents.push(source.content);
    }
    listing.push(reviewMappingListingEntry({ source: source.source,
      records: leftBehind.length === 0 && mapped !== undefined ? [mapped.reference] : [], leftBehind }));
  }
  return { records: [...groups.values()], listing };
}
