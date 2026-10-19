/** Bind immutable decisions to one invocation's work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewDecisionPort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewDecisionSchema } from "./schema.js";
import { reviewDecisionKey } from "./key.js";

/** Open typed decision access on the supplied backend. */
export function createReviewDecisionPort(store: Store, owner: OwnerIdentity): ReviewDecisionPort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/decision"](owner, key),
    ReviewDecisionSchema, reviewDecisionKey);
  return { read: access.read, list: access.list,
    create: (value) => access.write(value, null), prepareCreate: (value) => access.prepare(value, null) };
}
