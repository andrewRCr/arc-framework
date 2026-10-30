/** Replay accepted legacy Candidate versions without rewriting their complete content. */
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import { parseCandidateManagedRecord, resolveCandidateSupersessionAncestors, CandidateSupersessionResolutionError } from
  "../../../work-unit/candidate-attestation.js";
import type { CandidateManagedRecordV1 } from "./candidate/schema.js";
import type { ReviewMappingSource } from "./mapping-listing.js";
import { reviewMappingListingEntry } from "./mapping-listing.js";
import type { ReviewMappingInput, ReviewMappingResult, ReviewMappingWorkItem } from "./mapping-types.js";

type CandidateRevision = { source: string; workItem: ReviewMappingWorkItem; content: string };
type CandidateMappingState = {
  histories: Map<string, CandidateManagedRecordV1[]>;
  groups: Map<string, ReviewMappingResult["records"][number]>;
  newest: Map<string, { content: string; reason: string | null }>;
};

function candidateRevisionReason(source: CandidateRevision, record: CandidateManagedRecordV1 | null,
  history: readonly CandidateManagedRecordV1[]): string | null {
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

function candidateListingEntry(source: string, reason: string | null,
  mapped: ReviewMappingResult["records"][number] | undefined): ReviewMappingResult["listing"][number] {
  return reviewMappingListingEntry({ source, records: reason === null && mapped !== undefined ? [mapped.reference] : [],
    leftBehind: reason === null ? [] : [reason] });
}

/** Append an accepted revision's bytes to its work item's record, or record why today's reader refuses it. */
function candidateRevisionListing(source: CandidateRevision, state: CandidateMappingState): ReviewMappingResult["listing"][number] {
  const record = parseCandidateManagedRecord(source.content);
  const history = state.histories.get(source.workItem.uid) ?? [];
  const reason = candidateRevisionReason(source, record, history);
  if (record !== null) { history.unshift(record); state.histories.set(source.workItem.uid, history); }
  let mapped = state.groups.get(source.workItem.uid);
  if (reason === null) {
    if (mapped === undefined) {
      mapped = { reference: recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item",
        name: source.workItem.slug, uid: source.workItem.uid })), contents: [] };
      state.groups.set(source.workItem.uid, mapped);
    }
    mapped.contents.push(source.content);
  }
  state.newest.set(source.workItem.uid, { content: source.content, reason });
  return candidateListingEntry(source.source, reason, mapped);
}

/** A work item's Candidate contents oldest first, its current record last unless it repeats the newest committed version. */
export function candidateRevisionContents(candidate: ReviewMappingInput["candidates"][number]): string[] {
  const contents = candidate.versions.map(({ content }) => content);
  return candidate.current === null || candidate.current === contents.at(-1) ? contents : [...contents, candidate.current];
}

/** A current record repeating its newest committed version takes that version's outcome; a newer one is the record's newest revision. */
function currentCandidateListing(source: CandidateRevision, state: CandidateMappingState): ReviewMappingResult["listing"][number] {
  const newest = state.newest.get(source.workItem.uid);
  if (newest === undefined || newest.content !== source.content) return candidateRevisionListing(source, state);
  return candidateListingEntry(source.source, newest.reason, state.groups.get(source.workItem.uid));
}

/** Keep accepted source bytes in chronological order and classify each refused version separately. */
export function mapReviewCandidateSources(sources: readonly ReviewMappingSource[]): {
  records: ReviewMappingResult["records"]; listing: ReviewMappingResult["listing"];
} {
  const current = new Set(sources.flatMap((source) => source.kind === "current-candidate" ? [source.workItem.uid] : []));
  const state: CandidateMappingState = { histories: new Map(), groups: new Map(), newest: new Map() };
  const listing: ReviewMappingResult["listing"] = [];
  for (const source of sources) {
    if (source.kind === "current-candidate") listing.push(currentCandidateListing(source, state));
    else if (source.kind !== "candidate") continue;
    else if (source.workItem.live && !current.has(source.workItem.uid)) {
      listing.push(candidateListingEntry(source.source, "The live work unit holds no current Candidate record, which today's reader then does not find.", undefined));
    } else listing.push(candidateRevisionListing(source, state));
  }
  return { records: [...state.groups.values()], listing };
}
