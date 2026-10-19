/** One operational backend and project-identity reader shared by nested review compositions. */
import type { GitExec } from "../../../lib/git/exec.js";
import type { Store } from "../../../lib/store/contract.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import { createStore } from "../../../lib/store/create.js";
import { createDefaultStorePorts } from "../../../lib/store/default-ports.js";
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

/** Open one checkout backend or retain the caller's exact existing selection. */
export function resolveReviewInvocation(input: ReviewInvocationInput): ReviewInvocationContext {
  const store = input.store ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd, exec: input.exec }));
  return { store, projectId: input.projectId ?? createProjectIdentityReader(store),
    ...(input.workItem === undefined ? {} : { workItem: input.workItem }) };
}
