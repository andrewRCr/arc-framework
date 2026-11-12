/** Production checkout/ref boundaries shared by operational abandonment and teardown. */
import type { UserIOContext } from "../../commands/user/types.js";
import type { ExecuteTransitionContext } from "./lifecycle-executor.js";
import { createNodeTeardownSelectionReader } from "./teardown-selection.js";
import { createNodeTeardownWorktreeTransactionDriver } from "./teardown-worktree-transaction.js";
import type { TeardownContext } from "./verbs/teardown.js";
import { createStore } from "../store/create.js";
import { createDefaultStorePorts } from "../store/default-store-ports.js";
import { createProjectionRemovalSlots } from "../store/projection/removal-slots.js";
import type { ProjectionPersistHooks } from "../store/projection/removal-persist.js";
/** Bind physical cleanup without reading lifecycle artifacts or expanding remote work units. */
export function createStoreTeardownContext(base: { cwd: string; identity: string; io: UserIOContext }, executor: ExecuteTransitionContext,
  hooks?: ProjectionPersistHooks): TeardownContext {
  let locus = base.cwd;
  const exec: TeardownContext["exec"] = (command, args, options) => base.io.exec(command, args, { cwd: locus, ...options });
  const store = executor.store ?? createStore(createDefaultStorePorts({ checkoutRoot: base.cwd, exec }));
  return {
    cwd: base.cwd, exec, execInput: base.io.execInput, store, projectId: executor.projectId, locusPorts: executor.locusPorts,
    projectionRemovalSlots: createProjectionRemovalSlots({ store, identity: base.identity, hooks }),
    indexFs: executor.indexFs,
    chdir: (path) => { process.chdir(path); locus = path; }, readCurrentLocus: () => locus,
    readBlob: () => Promise.reject(new Error("Operational retirement reads its store evidence, not Git lifecycle blobs.")),
    readTeardownSelection: createNodeTeardownSelectionReader({ exec, identity: base.identity }),
    teardownWorktree: createNodeTeardownWorktreeTransactionDriver({ exec, identity: base.identity, cwd: base.cwd }),
  };
}
