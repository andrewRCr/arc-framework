/** Bind ended review results to one invocation's store and work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewOutcomePort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewOutcomeSchema } from "./schema.js";
import { reviewOutcomeKey } from "./key.js";

/** Open typed outcome access without opening another backend. */
export function createReviewOutcomePort(store: Store, owner: OwnerIdentity): ReviewOutcomePort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/outcome"](owner, key),
    ReviewOutcomeSchema, reviewOutcomeKey);
  return {
    read: access.read,
    list: access.list,
    create: (value) => access.write(value, null),
    prepareCreate: (value) => access.prepare(value, null),
  };
}
