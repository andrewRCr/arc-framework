/** Shared typed reads and prepared writes for portable review facts. */
import type { z } from "zod";
import type { Store } from "../../contract.js";
import { RecordVersionSchema, type RecordReference, type RecordVersion } from "../../identity.js";
import type { ReviewFactListing, ReviewFactPut, StoredReviewFact } from "../../../../scripts/review-gate/core/ports.js";
import { readReviewRecord, unwrapReviewRecordResult } from "./access-shared.js";

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
      if (result.status === "refused") return { status: "unavailable",
        reason: `${result.refusal.condition} ${result.refusal.remedy.text}` };
      const listing = result.result;
      if (listing.status === "absent") return { status: "complete", records: [] };
      if (listing.status === "unreadable") return { status: "unavailable", reason: `${listing.condition} ${listing.remedy.text}` };
      if (listing.missed || listing.diagnostics.length > 0) return { status: "incomplete",
        reason: `Review fact listing is incomplete. ${listing.diagnostics.map((entry) =>
          `${entry.condition} ${entry.remedy.text}`).join(" ")}`.trim() };
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
      const result = unwrapReviewRecordResult(await store.write({ ...put,
        provenance: { verb: "review", lifecycleAction: "edit" } }));
      return { reference: result.reference, version: RecordVersionSchema.parse(result.version),
        value: schema.parse(JSON.parse(put.content)) };
    },
  };
}
