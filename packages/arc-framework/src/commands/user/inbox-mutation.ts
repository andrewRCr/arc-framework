/** Lock-serialized, atomic mutation boundary for identity-global `USER-INBOX`. */

import { atomicWriteFile } from "../../lib/fs.js";
import {
  acquireAdvisoryLock,
  getNotesLockPath,
  inboxEntrySourceDigest,
  inspectInboxEntry,
  mutateInboxEntries,
  releaseAdvisoryLock,
  type AdvisoryLockHandle,
  type InboxEntryMutation,
  type MutateInboxEntriesResult,
} from "../../lib/user-sync/index.js";
import { resolveUserSurfaceResolver } from "../../lib/user-surfaces.js";
import { SlugSchema } from "../../lib/kernel/index.js";
import type { UserIOContext } from "./types.js";

/** Exact USER-INBOX state observed or written while holding the notes lock. */
export type UserInboxPostImage =
  | { state: "missing"; content: null; digest: null }
  | { state: "present"; content: string; digest: MutateInboxEntriesResult["digest"] };

/** Injectable transaction boundaries for deterministic failure and interleaving tests. */
export interface UserInboxMutationDependencies {
  atomicReplace?: (path: string, content: string) => Promise<void>;
  acquireLock?: (path: string) => Promise<AdvisoryLockHandle>;
  releaseLock?: (handle: AdvisoryLockHandle) => Promise<void>;
}

/** Options shared by exact inbox mutation operations. */
export interface RunUserInboxMutationOptions {
  cwd: string;
  io: UserIOContext;
  identity: string;
  mutations: readonly InboxEntryMutation[];
}

/** Exact result of one lock-serialized inbox mutation batch. */
export interface RunUserInboxMutationResult {
  changed: boolean;
  outcomes: MutateInboxEntriesResult["outcomes"];
  postImage: UserInboxPostImage;
}

interface LockedInboxContext {
  content: string | null;
  path: string;
}

/** Execute one USER-INBOX read/validate/replace transaction under the identity notes lock. */
export async function withLockedUserInbox<T>(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity">,
  mutate: (context: LockedInboxContext) => { result: T; replacement?: string }
    | Promise<{ result: T; replacement?: string }>,
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ result: T; postImage: UserInboxPostImage }> {
  const { cwd, io, identity } = options;
  const inboxPath = (await resolveUserSurfaceResolver({ cwd, identity: SlugSchema.parse(identity), exec: io.exec }))
    .identityGlobalPath("USER-INBOX.md");
  const acquireLock = dependencies.acquireLock ?? acquireAdvisoryLock;
  const releaseLock = dependencies.releaseLock ?? releaseAdvisoryLock;
  const lock = await acquireLock(await getNotesLockPath(io.exec, cwd, identity));
  try {
    let content: string | null;
    try {
      content = await io.readFile(inboxPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      content = null;
    }
    const mutation = await mutate({ content, path: inboxPath });
    if (mutation.replacement !== undefined) {
      await (dependencies.atomicReplace ?? atomicWriteFile)(inboxPath, mutation.replacement);
      const post = mutateInboxEntries(mutation.replacement, []);
      return {
        result: mutation.result,
        postImage: { state: "present", content: mutation.replacement, digest: post.digest },
      };
    }
    if (content === null) return { result: mutation.result, postImage: { state: "missing", content: null, digest: null } };
    const post = mutateInboxEntries(content, []);
    return { result: mutation.result, postImage: { state: "present", content, digest: post.digest } };
  } finally {
    await releaseLock(lock);
  }
}

/** Apply an exact title/source-digest-qualified mutation batch. */
export async function runUserInboxMutation(
  options: RunUserInboxMutationOptions,
  dependencies: UserInboxMutationDependencies = {},
): Promise<RunUserInboxMutationResult> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) {
      if (options.mutations.every((mutation) => mutation.kind === "remove")) {
        return {
          result: {
            changed: false,
            outcomes: options.mutations.map((mutation) => ({
              title: mutation.title.trim(),
              state: "already-applied" as const,
            })),
          },
        };
      }
      throw new Error("USER-INBOX is missing.");
    }
    const result = mutateInboxEntries(content, options.mutations);
    return {
      result: { changed: result.changed, outcomes: result.outcomes },
      ...(result.changed ? { replacement: result.content } : {}),
    };
  }, dependencies);
  return { ...transaction.result, postImage: transaction.postImage };
}

/** Remove the unique current title while retaining exact under-lock digest qualification. */
export async function removeCurrentInboxEntry(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity"> & { title: string },
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ removed: boolean; postImage: UserInboxPostImage }> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) return { result: { removed: false } };
    let sourceDigest: InboxEntryMutation["sourceDigest"];
    try {
      sourceDigest = inboxEntrySourceDigest(content, options.title);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Missing USER-INBOX entry")) {
        return { result: { removed: false } };
      }
      throw error;
    }
    const result = mutateInboxEntries(content, [{ kind: "remove", title: options.title, sourceDigest }]);
    return { result: { removed: result.changed }, replacement: result.content };
  }, dependencies);
  return { ...transaction.result, postImage: transaction.postImage };
}

/** Clear only one exact current dispatch binding without deleting its capture. */
export async function unmarkCurrentInboxEntry(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity"> & { title: string; dispatchId: string },
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ changed: boolean; postImage: UserInboxPostImage }> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) throw new Error("USER-INBOX is missing.");
    const entry = inspectInboxEntry(content, options.title);
    if (entry.dispatchId === null) return { result: { changed: false } };
    if (entry.dispatchId !== options.dispatchId) {
      throw new Error(`USER-INBOX entry '${entry.title}' is bound to another dispatch.`);
    }
    const result = mutateInboxEntries(content, [{
      kind: "unmark",
      title: entry.title,
      sourceDigest: entry.sourceDigest,
      dispatchId: options.dispatchId,
    }]);
    return { result: { changed: result.changed }, replacement: result.content };
  }, dependencies);
  return { ...transaction.result, postImage: transaction.postImage };
}
