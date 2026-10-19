/** Personal command Store binding, including its existing injectable write and lock seams. */
import { createStore } from "./create.js";
import { createDefaultStorePorts } from "./default-ports.js";
import { withAdvisoryLock, type AdvisoryLockHandle } from "../advisory-lock.js";
import { getNotesLockPath } from "../user-sync/notes-lock.js";
import { ArcError, SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import type { GitExec } from "../git/exec.js";
/** Existing personal mutation failure/interleaving seams, bound at the provider boundary. */
export interface PersonalCommandStoreOverrides {
  atomicReplace?: (path: string, content: string) => Promise<void>;
  acquireLock?: (path: string) => Promise<AdvisoryLockHandle>;
  releaseLock?: (handle: AdvisoryLockHandle) => Promise<void>;
}
/** Bind one explicit identity; every write acquires only its backend's notes lock. */
export function createPersonalCommandStore(cwd: string, exec: GitExec, identity: string,
  overrides: PersonalCommandStoreOverrides = {}): Store {
  const ports = createDefaultStorePorts({ checkoutRoot: cwd, exec, identity: SlugSchema.parse(identity) });
  if (overrides.atomicReplace !== undefined) ports.fs.writeFile = overrides.atomicReplace;
  if (overrides.acquireLock !== undefined || overrides.releaseLock !== undefined) {
    ports.locks.notes = async operation => withAdvisoryLock(await getNotesLockPath(exec, cwd, identity), operation, {}, overrides);
  }
  const store = createStore(ports);
  if (store.capabilities.stateOffBranch) return store;
  return { ...store,
    read: input => preservePersonalCommandFailure(() => store.read(input)),
    write: input => preservePersonalCommandFailure(() => store.write(input)),
  };
}

async function preservePersonalCommandFailure<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof ArcError && error.code === "store.operation-failed" && error.cause instanceof Error) throw error.cause;
    throw error;
  }
}
