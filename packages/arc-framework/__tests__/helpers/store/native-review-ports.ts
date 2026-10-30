/** Native review ports bound through the invocation's family binding, over one store and work item. */
import type { GitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { bindReviewFamilyPorts, type RepositoryReviewFamilyPorts, type StoredReviewFamilyPorts }
  from "../../../src/scripts/review-gate/runtime/family-ports.js";

// A stored binding never reaches the repository adapters, so any access is a test defect.
const repository = new Proxy({}, {
  get: () => { throw new Error("A stored review binding read a repository adapter"); },
}) as RepositoryReviewFamilyPorts;

/** Bind the stored review family as an invocation does, keeping in-flight state on `publisher`. */
export function bindNativeReviewPorts(input: { store: Store; owner: OwnerIdentity; publisher: GitCommonStatePublisher;
  projectId?: () => Promise<string> }): StoredReviewFamilyPorts {
  const bound = bindReviewFamilyPorts({ ...input, repository });
  if (bound.mode !== "stored") throw new Error("Bind native review ports over a store holding state off the branch");
  return bound.ports;
}
