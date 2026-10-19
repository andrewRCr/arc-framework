/** Bind ended review results to one invocation's store and work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewOutcomePort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewOutcomeSchema } from "./schema.js";
import { reviewOutcomeKey } from "./key.js";
import { laneSubjectLineageId } from "../../../../../scripts/review-gate/core/lane-admission.js";

/** Open typed outcome access without opening another backend. */
export function createReviewOutcomePort(store: Store, owner: OwnerIdentity): ReviewOutcomePort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/outcome"](owner, key),
    ReviewOutcomeSchema, reviewOutcomeKey);
  return {
    read: access.read,
    async list(selection) {
      const listing = await access.list();
      return selection === undefined || listing.status !== "complete" ? listing : { status: "complete",
        records: listing.records.filter(({ value }) => value.lane === selection.lane
          && laneSubjectLineageId(value.lineage) === laneSubjectLineageId(selection.lineage)) };
    },
    create: (value) => access.write(value, null),
    prepareCreate: (value) => access.prepare(value, null),
  };
}
