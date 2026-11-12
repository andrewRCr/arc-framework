/** Identity-global inbox mutation through a selected Store and its write lock. */

import { contentDigest } from "../../lib/canonical/content-digest.js";
import { resolveEntryList } from "../../lib/inbox/lists.js";
import { removeInboxEntry } from "../../lib/inbox/removal.js";
import type { InboxContext } from "../../lib/inbox/types.js";
import { createPersonalCommandStore, type PersonalCommandStoreOverrides } from "../../lib/store/personal-command-store.js";
import type { Store } from "../../lib/store/contract.js";
import { mutateStoreInbox } from "./inbox-store.js";
import {
  inboxEntrySourceDigest,
  inspectInboxEntry,
  markInboxEntriesExecuteBoundInOrder,
  mutateInboxEntries,
  type InboxEntryMutation,
  type MutateInboxEntriesResult,
} from "../../lib/user-sync/inbox-writer.js";
import type { UserInboxPostImage, UserIOContext } from "./types.js";

/** Injectable transaction boundaries for deterministic failure and interleaving tests. */
export type UserInboxMutationDependencies = PersonalCommandStoreOverrides;

/** Options shared by exact inbox mutation operations. */
export interface RunUserInboxMutationOptions {
  store?: Store;
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

/** Execute one inbox mutation using the selected backend's version and write lock. */
export async function withLockedUserInbox<T>(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity" | "store">,
  mutate: (context: LockedInboxContext) => { result: T; replacement?: string }
    | Promise<{ result: T; replacement?: string }>,
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ result: T; postImage: UserInboxPostImage }> {
  const { cwd, io, identity } = options;
  const store = options.store ?? createPersonalCommandStore(cwd, io.exec, identity, dependencies);
  return mutateStoreInbox({ store, cwd, identity }, mutate);
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
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity" | "store"> & { title: string; entry?: { id: string; expectedVersion: string; list?: "personal" | "project" }; inboxContext?: InboxContext },
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ removed: boolean; postImage: UserInboxPostImage; disposition?: "removed" | "retained" | "absent"; foundVersion?: string }> {
  if (options.inboxContext?.store.capabilities.stateOffBranch) {
    if (options.entry === undefined) throw new Error("Use --id <id> --expected-version <version>; read arc inbox personal for the entry ID and version.");
    const result = await removeInboxEntry({ list: options.entry.list ?? "personal", ...options.entry }, options.inboxContext);
    if (result.status === "refused") throw new Error(`${result.refusal.condition} ${result.refusal.remedy.text}`);
    const after = await resolveEntryList(options.entry.list ?? "personal", options.inboxContext);
    if (after.status === "refused") throw new Error(`${after.refusal.condition} ${after.refusal.remedy.text}`);
    const saved = after.result.saved;
    const postImage: UserInboxPostImage = saved === null ? { state: "missing", content: null, digest: null }
      : { state: "present", content: saved.content, digest: contentDigest(Buffer.from(saved.content, "utf8")) };
    return { removed: result.result.disposition === "removed", postImage, ...result.result };
  }
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

/** Mark selected current entries execute-bound in one lock-serialized transaction. */
export async function markCurrentInboxEntriesExecuteBound(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity" | "store"> & { titles: readonly string[] },
  dependencies: UserInboxMutationDependencies = {},
): Promise<RunUserInboxMutationResult> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) throw new Error("USER-INBOX is missing.");
    const result = markInboxEntriesExecuteBoundInOrder(content, options.titles);
    return {
      result: { changed: result.changed, outcomes: result.outcomes },
      ...(result.changed ? { replacement: result.content } : {}),
    };
  }, dependencies);
  return { ...transaction.result, postImage: transaction.postImage };
}

/** Clear one current execute-bound mark without deleting its capture. */
export async function unmarkCurrentInboxEntry(
  options: Pick<RunUserInboxMutationOptions, "cwd" | "io" | "identity" | "store"> & { title: string },
  dependencies: UserInboxMutationDependencies = {},
): Promise<{ changed: boolean; postImage: UserInboxPostImage }> {
  const transaction = await withLockedUserInbox(options, ({ content }) => {
    if (content === null) throw new Error("USER-INBOX is missing.");
    const entry = inspectInboxEntry(content, options.title);
    if (!entry.executeBound) return { result: { changed: false } };
    const result = mutateInboxEntries(content, [{
      kind: "unmark",
      title: entry.title,
      sourceDigest: entry.sourceDigest,
    }]);
    return { result: { changed: result.changed }, replacement: result.content };
  }, dependencies);
  return { ...transaction.result, postImage: transaction.postImage };
}
