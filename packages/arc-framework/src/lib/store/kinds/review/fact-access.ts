/** Shared typed reads and prepared writes for portable review facts. */
import type { z } from "zod";
import { describeRecordConflicts, recordConflictRefusal } from "../../conflict-diagnostics.js";
import type { Store } from "../../contract.js";
import type { Remedy, StoreRefusal, StoreResult } from "../../refusal.js";
import type { ListingOutcome } from "../../read.js";
import { RecordVersionSchema, type RecordReference, type RecordVersion } from "../../identity.js";
import type { ReviewFactListing, ReviewFactPut, StoredReviewFact } from "../../../../scripts/review-gate/core/ports.js";
import { decodeStoredReviewRecord, readReviewRecord, unwrapReviewRecordResult } from "./access-shared.js";
import { ReviewFactVersionConflictError } from "./errors.js";
import { StoreRefusalError } from "../../refusal-error.js";

/** The recoverable refusal a review listing that cannot complete carries, or null for a complete or absent one. */
export function reviewListingRefusal(result: StoreResult<ListingOutcome>): StoreRefusal | null {
  const malformed = (rule: string, condition: string, remedy: Remedy): StoreRefusal =>
    ({ code: "record-malformed", class: "recoverable", rule, condition, remedy });
  if (result.status === "refused") return result.refusal;
  const listing = result.result;
  if (listing.status === "absent") return null;
  if (listing.status === "unreadable") return malformed("review.listing-unreadable", listing.condition, listing.remedy);
  if (listing.missed || listing.diagnostics.length > 0) {
    const condition = ["Review fact listing is incomplete.", ...listing.diagnostics.map(entry => entry.condition)].join(" ");
    const remedies = [...new Set(listing.diagnostics.map(entry => entry.remedy.text))];
    return malformed("review.listing-incomplete", condition,
      { text: remedies.length > 0 ? remedies.join(" ") : "Restore the complete review listing, then retry." });
  }
  const conflicted = listing.records.find(record => record.conflicts.length > 0);
  return conflicted === undefined ? null : recordConflictRefusal({ reference: conflicted.reference,
    conflicts: listing.records.flatMap(record => record.conflicts) }, "Review fact listing", "review.record-conflict");
}

/** A listing that could not complete, thrown with an off-branch store's refusal whole. */
export function reviewFactListingError(listing: Exclude<ReviewFactListing<unknown>, { status: "complete" }>): Error {
  return listing.refusal === undefined ? new Error(listing.reason) : new StoreRefusalError(listing.refusal, true);
}

interface ReviewFactAccess<T> {
  prepare: (value: T, expected: RecordVersion | null) => ReviewFactPut;
  read: (key: string) => Promise<StoredReviewFact<T> | null>;
  list: () => Promise<ReviewFactListing<T>>;
  write: (value: T, expected: RecordVersion | null) => Promise<StoredReviewFact<T>>;
}

/** Bind one fact codec and key function to the caller's store and owner. */
export function createReviewFactAccess<T>(store: Store, reference: (key: string) => RecordReference,
  schema: z.ZodType<T>, key: (value: T) => string): ReviewFactAccess<T> {
  const prepare = (value: T, expected: RecordVersion | null): ReviewFactPut => {
    const parsed = schema.parse(value);
    return { action: "put", reference: reference(key(parsed)), expected, content: JSON.stringify(parsed) };
  };
  return {
    prepare,
    async list(): Promise<ReviewFactListing<T>> {
      const scope = reference("listing");
      const result = await store.list({ family: "review", kind: scope.kind, owner: scope.owner });
      const refusal = reviewListingRefusal(result);
      // Natively every non-complete listing carries its refusal; the repository arm reports its reason alone.
      const refused = refusal !== null && store.capabilities.stateOffBranch ? { refusal } : {};
      if (result.status === "refused") return { status: "unavailable", reason: `${result.refusal.condition} ${result.refusal.remedy.text}`,
        ...refused };
      const listing = result.result;
      if (listing.status === "absent") return { status: "complete", records: [] };
      if (listing.status === "unreadable") return { status: "unavailable", reason: `${listing.condition} ${listing.remedy.text}`,
        ...refused };
      if (listing.missed || listing.diagnostics.length > 0) return { status: "incomplete",
        reason: `Review fact listing is incomplete. ${listing.diagnostics.map((entry) =>
          `${entry.condition} ${entry.remedy.text}`).join(" ")}`.trim(), ...refused };
      const conflicts = listing.records.flatMap(record => record.conflicts);
      if (conflicts.length > 0) return { status: "incomplete",
        reason: `Review fact listing has unresolved conflicts.${describeRecordConflicts(conflicts)}`, ...refused };
      return { status: "complete", records: listing.records.map((record) => ({
        reference: record.reference, version: record.version, value: schema.parse(JSON.parse(record.content)),
      })) };
    },
    async read(recordKey: string): Promise<StoredReviewFact<T> | null> {
      const record = await readReviewRecord(store, reference(recordKey));
      return record === null ? null : { reference: record.reference, version: record.version,
        value: decodeStoredReviewRecord(store, record, content => schema.parse(JSON.parse(content))) };
    },
    async write(value: T, expected: RecordVersion | null): Promise<StoredReviewFact<T>> {
      const put = prepare(value, expected);
      const written = await store.write({ ...put, provenance: { verb: "review", lifecycleAction: "edit" } });
      if (written.status === "refused" && written.refusal.code === "version-conflict") throw new ReviewFactVersionConflictError(written.refusal, store.capabilities.stateOffBranch);
      const result = unwrapReviewRecordResult(store, written);
      return { reference: result.reference, version: RecordVersionSchema.parse(result.version),
        value: schema.parse(JSON.parse(put.content)) };
    },
  };
}
