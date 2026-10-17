/** Request-scoped personal-surface readers shared by status modes. */

import { OwnerIdentitySchema, recordReferences } from "../../lib/store/identity.js";
import { parseEntryList } from "../../lib/store/kinds/entry-list.js";
import { createStore } from "../../lib/store/create.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import type { StoreSyncPort } from "../../lib/store/operational-sync.js";
import type { Store } from "../../lib/store/contract.js";
import { readdir, readFile } from "node:fs/promises";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import type { RawGitExec } from "../../lib/git/exec.js";
import type { GitExec } from "../../lib/git/index.js";
import { createUserIOContext } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import { resolveSessionPersonalPaths, type SessionPersonalPaths } from "./personal-paths.js";
import type { LifecycleIndexFs } from "../../lib/work-unit/lifecycle-index.js";
import { readIdentityPointers } from "../identity-pointers.js";

/** I/O and cached readers bound once for a non-slug status invocation. */
export interface SessionStatusContext {
  /** One operational store selected by the status invocation. */
  store?: Store;
  storeSync?: StoreSyncPort;
  cwd: string;
  exec: GitExec;
  transitionExec: RawGitExec;
  localOnlyTransitionExec: RawGitExec;
  lifecycleFs: LifecycleIndexFs;
  io: ReturnType<typeof createUserIOContext>;
  identity: string | null;
  role: string | null;
  userSurfacesFor: (id: string) => Promise<SessionPersonalPaths>;
  readUserInbox: (id: string) => Promise<string>;
}

/**
 * Bind personal reads without eagerly resolving any user surface.
 * @param cwd - Project checkout root.
 * @param exec - Request Git executor.
 * @param transitionExec - Bound transition reader.
 * @param localOnlyTransitionExec - Transition reader restricted to local objects.
 * @param interaction - Invocation subprocess policy.
 * @returns One cached reader context for the selected mode.
 */
export async function createSessionStatusContext(
  cwd: string,
  exec: GitExec,
  transitionExec: RawGitExec,
  localOnlyTransitionExec: RawGitExec,
  interaction?: InteractionContext,
  operational?: { store: Store; sync?: StoreSyncPort },
): Promise<SessionStatusContext> {
  const lifecycleFs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const io = createUserIOContext(interaction?.subprocess);
  const { identity, role } = await readIdentityPointers(exec);
  const store = operational?.store ?? createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec, execInput: io.execInput,
    ...(identity === null ? {} : { identity: SlugSchema.parse(identity) }) }));
  const userSurfaceResolvers = new Map<string, ReturnType<typeof resolveSessionPersonalPaths>>();
  const userSurfacesFor = (id: string): Promise<SessionPersonalPaths> => {
    let resolver = userSurfaceResolvers.get(id);
    if (resolver === undefined) {
      resolver = resolveSessionPersonalPaths({ cwd, identity: id, exec });
      userSurfaceResolvers.set(id, resolver);
    }
    return resolver;
  };
  const readUserInbox = (id: string): Promise<string> => {
    const read = readUserInboxFromStore(store, id);
    return store.capabilities.stateOffBranch ? read : read.catch(() => "");
  };

  return {
    cwd, exec, transitionExec, localOnlyTransitionExec, lifecycleFs, io,
    identity, role, store, storeSync: operational?.sync, userSurfacesFor, readUserInbox,
  };
}

/** Read one identity's inbox through the request's selected operational store. */
export async function readUserInboxFromStore(store: Store, identity: string): Promise<string> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  const read = await store.read({ reference: recordReferences["personal/inbox"](owner) });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return "";
    throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  }
  if (!store.capabilities.stateOffBranch) return read.result.content;
  if (read.result.conflicts.length > 0) throw new Error("The personal inbox has unresolved conflicts. Resolve them before routing its entries.");
  const parsed = parseEntryList(read.result.content, "personal/inbox");
  if (!parsed.success) throw new Error(parsed.error);
  return read.result.content;
}

/** Read working memory through the invocation's selected personal Store. */
export async function readWorkingMemoryFromStore(store: Store, identity: string): Promise<string> {
  const owner = OwnerIdentitySchema.parse({ type: "person", name: identity });
  const read = await store.read({ reference: recordReferences["personal/working-memory"](owner) });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return "";
    throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  }
  if (read.result.conflicts.length > 0) throw new Error("Working memory has unresolved conflicts. Resolve them before reconciling its references.");
  return read.result.content;
}
