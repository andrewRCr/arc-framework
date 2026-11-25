/** One operational backend and project-identity reader shared by nested review compositions. */
import { requireNativeReviewDecisionReferences, type ReviewGrantReferences } from "../policy/review-grant-references.js";
import type { GitExec } from "../../../lib/git/exec.js";
import type { Store } from "../../../lib/store/contract.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import { createStore } from "../../../lib/store/create.js";
import { createDefaultStorePorts } from "../../../lib/store/default-store-ports.js";
import { retryEndedItemHistory } from "../../../lib/store/history-retry.js";
import { createProjectIdentityReader } from "../../../lib/store/project-identity.js";

/** Optional authority carried from an already selected invocation. */
export interface ReviewInvocationOptions {
  store?: Store;
  projectId?: () => Promise<string>;
  workItem?: OwnerIdentity;
}

/** The originating checkout, before any source materialization changes its path. */
export interface ReviewInvocationInput extends ReviewInvocationOptions {
  cwd: string;
  exec: GitExec;
}

/** Bound operational authority retained across nested dependency builders. */
export interface ReviewInvocationContext {
  store: Store;
  projectId: () => Promise<string>;
  workItem?: OwnerIdentity;
}

/** Open one checkout backend or retain the caller's exact selection, either retrying an ended item's history. */
export function resolveReviewInvocation(input: ReviewInvocationInput, references?: ReviewGrantReferences): ReviewInvocationContext {
  const store = retryEndedItemHistory(input.store ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd, exec: input.exec })));
  requireNativeReviewDecisionReferences(store.capabilities.stateOffBranch, references);
  return { store, projectId: input.projectId ?? createProjectIdentityReader(store),
    ...(input.workItem === undefined ? {} : { workItem: input.workItem }) };
}

/** Retain one bound invocation for each checkout resolved by a handler's deferred callbacks. */
export function createReviewInvocationResolver(exec: GitExec, options: ReviewInvocationOptions = {}):
  (cwd: string) => ReviewInvocationContext {
  const contexts = new Map<string, ReviewInvocationContext>();
  return cwd => {
    let context = contexts.get(cwd);
    if (context === undefined) {
      context = resolveReviewInvocation({ ...options, cwd, exec });
      contexts.set(cwd, context);
    }
    return context;
  };
}
