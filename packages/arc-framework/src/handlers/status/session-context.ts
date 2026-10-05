/** Request-scoped personal-surface readers shared by status modes. */

import { readdir, readFile } from "node:fs/promises";
import type { InteractionContext } from "../../lib/command-input/interaction-context.js";
import type { RawGitExec } from "../../lib/git/exec.js";
import type { GitExec } from "../../lib/git/index.js";
import { createUserIOContext } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import { resolveUserSurfaceResolver, type UserSurfaceResolver } from "../../lib/user-surfaces.js";
import type { LifecycleIndexFs } from "../../lib/work-unit/lifecycle-index.js";
import { readIdentityPointers } from "../identity-pointers.js";

/** I/O and cached readers bound once for a non-slug status invocation. */
export interface SessionStatusContext {
  cwd: string;
  exec: GitExec;
  transitionExec: RawGitExec;
  localOnlyTransitionExec: RawGitExec;
  lifecycleFs: LifecycleIndexFs;
  io: ReturnType<typeof createUserIOContext>;
  identity: string | null;
  role: string | null;
  userSurfacesFor: (id: string) => Promise<UserSurfaceResolver>;
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
): Promise<SessionStatusContext> {
  const lifecycleFs = {
    readdir: (path: string) => readdir(path, { withFileTypes: true }),
    readFile: (path: string) => readFile(path, "utf8"),
  };
  const io = createUserIOContext(interaction?.subprocess);
  const { identity, role } = await readIdentityPointers(exec);
  const userSurfaceResolvers = new Map<string, ReturnType<typeof resolveUserSurfaceResolver>>();
  const userSurfacesFor = (id: string): Promise<UserSurfaceResolver> => {
    let resolver = userSurfaceResolvers.get(id);
    if (resolver === undefined) {
      resolver = resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(id), exec });
      userSurfaceResolvers.set(id, resolver);
    }
    return resolver;
  };
  // Both the inbox-state and reminder-sweep probes read the same personal
  // `USER-INBOX.md`; a missing file reads as empty (no captures).
  const readUserInbox = (id: string): Promise<string> =>
    userSurfacesFor(id)
      .then((surfaces) => io.readFile(surfaces.identityGlobalPath("USER-INBOX.md")))
      .catch(() => "");

  return {
    cwd, exec, transitionExec, localOnlyTransitionExec, lifecycleFs, io,
    identity, role, userSurfacesFor, readUserInbox,
  };
}
