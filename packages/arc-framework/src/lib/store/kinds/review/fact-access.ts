/** Shared typed reads and prepared writes for portable review facts. */
import type { z } from "zod";
import { describeRecordConflicts, recordConflictRefusal } from "../../conflict-diagnostics.js";
import type { Store } from "../../contract.js";
import type { Remedy, StoreRefusal } from "../../refusal.js";
import { RecordVersionSchema, type RecordReference, type RecordVersion } from "../../identity.js";
import type { ReviewFactListing, ReviewFactPut, StoredReviewFact } from "../../../../scripts/review-gate/core/ports.js";
import { readReviewRecord, unwrapReviewRecordResult } from "./access-shared.js";
import { ReviewFactVersionConflictError } from "./errors.js";
import { StoreRefusalError } from "../../refusal-error.js";

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
      const offBranch = store.capabilities.stateOffBranch;
      // Natively every non-complete listing carries a recoverable refusal; the repository arm reports its reason alone.
      const refused = (refusal: StoreRefusal) => offBranch ? { refusal } : {};
      const unreadable = (rule: string, condition: string, remedy: Remedy) =>
        refused({ code: "record-malformed", class: "recoverable", rule, condition, remedy });
      const result = await store.list({ family: "review", kind: scope.kind, owner: scope.owner });
      if (result.status === "refused") return { status: "unavailable", reason: `${result.refusal.condition} ${result.refusal.remedy.text}`,
        ...refused(result.refusal) };
      const listing = result.result;
      if (listing.status === "absent") return { status: "complete", records: [] };
      if (listing.status === "unreadable") return { status: "unavailable", reason: `${listing.condition} ${listing.remedy.text}`,
        ...unreadable("review.listing-unreadable", listing.condition, listing.remedy) };
      if (listing.missed || listing.diagnostics.length > 0) {
        const condition = ["Review fact listing is incomplete.", ...listing.diagnostics.map(entry => entry.condition)].join(" ");
        const remedies = [...new Set(listing.diagnostics.map(entry => entry.remedy.text))];
        return { status: "incomplete", reason: `Review fact listing is incomplete. ${listing.diagnostics.map((entry) =>
          `${entry.condition} ${entry.remedy.text}`).join(" ")}`.trim(), ...unreadable("review.listing-incomplete", condition,
          { text: remedies.length > 0 ? remedies.join(" ") : "Restore the complete review listing, then retry." }) };
      }
      const conflicted = listing.records.find(record => record.conflicts.length > 0);
      const conflicts = listing.records.flatMap(record => record.conflicts);
      if (conflicted !== undefined) return { status: "incomplete",
        reason: `Review fact listing has unresolved conflicts.${describeRecordConflicts(conflicts)}`,
        ...refused(recordConflictRefusal({ reference: conflicted.reference, conflicts }, "Review fact listing", "review.record-conflict")) };
      return { status: "complete", records: listing.records.map((record) => ({
        reference: record.reference, version: record.version, value: schema.parse(JSON.parse(record.content)),
      })) };
    },
    async read(recordKey: string): Promise<StoredReviewFact<T> | null> {
      const record = await readReviewRecord(store, reference(recordKey));
      return record === null ? null : { reference: record.reference, version: record.version,
        value: schema.parse(JSON.parse(record.content)) };
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
