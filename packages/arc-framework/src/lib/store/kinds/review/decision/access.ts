/** Bind immutable decisions to one invocation's work item. */
import type { Store } from "../../../contract.js";
import { recordReferences, type OwnerIdentity } from "../../../identity.js";
import type { ReviewDecisionPort } from "../../../../../scripts/review-gate/core/ports.js";
import { createReviewFactAccess } from "../fact-access.js";
import { ReviewFactVersionConflictError } from "../errors.js";
import { ReviewDecisionSchema } from "./schema.js";
import { reviewDecisionKey } from "./key.js";

/** Open typed decision access on the supplied backend. */
export function createReviewDecisionPort(store: Store, owner: OwnerIdentity): ReviewDecisionPort {
  const access = createReviewFactAccess(store, (key) => recordReferences["review/decision"](owner, key),
    ReviewDecisionSchema, reviewDecisionKey);
  return { read: access.read, list: access.list, prepareCreate: (value) => access.prepare(value, null),
    async create(value) {
      try { return await access.write(value, null); }
      catch (error) {
        if (!(error instanceof ReviewFactVersionConflictError)) throw error;
        // A key is its decision less the recording time, so a concurrent writer of this key recorded this decision.
        const stored = await access.read(reviewDecisionKey(value));
        if (stored === null) throw error;
        return stored;
      }
    } };
}
