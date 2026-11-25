/** Personal inbox read/modify/write over a caller-selected Store. */
import { contentDigest } from "../../lib/canonical/content-digest.js";
import { ArcError, SlugSchema } from "../../lib/kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../../lib/layout/index.js";
import type { Store } from "../../lib/store/contract.js";
import { OwnerIdentitySchema, recordReferences } from "../../lib/store/identity.js";
import type { StoreRecord } from "../../lib/store/read.js";
import { mutatePersonalRecord } from "../../lib/store/personal-mutation.js";
import type { StoreResult } from "../../lib/store/refusal.js";
import type { UserInboxPostImage } from "./types.js";

/** One content-based operation, bound to the actual personal record's version. */
export async function mutateStoreInbox<T>(input: { store: Store; cwd: string; identity: string },
  mutate: (context: { content: string | null; path: string }) => { result: T; replacement?: string }
    | Promise<{ result: T; replacement?: string }>,
): Promise<{ result: T; postImage: UserInboxPostImage }> {
  const identity = SlugSchema.parse(input.identity);
  const reference = recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: identity }));
  const path = materializeArcPath(input.cwd, resolveArcPath({ kind: "inbox", scope: { kind: "identity", identity } }));
  const transaction = unwrap(await mutatePersonalRecord({ store: input.store, reference, verb: "personal-inbox-mutation",
    mutate: record => mutate({ content: record === null ? null : checkedContent(record), path }),
  }));
  return { result: transaction.result, postImage: postImage(transaction.record === null ? null : checkedContent(transaction.record)) };
}
function checkedContent(record: StoreRecord): string {
  if (record.conflicts.length > 0) throw new ArcError("Personal inbox has unresolved conflicts; resolve them before retrying.", "user.inbox-conflicts");
  return record.content;
}
function postImage(content: string | null): UserInboxPostImage {
  return content === null ? { state: "missing", content: null, digest: null }
    : { state: "present", content, digest: contentDigest(Buffer.from(content, "utf8")) };
}
function unwrap<T>(result: StoreResult<T>): T {
  if (result.status === "ok") return result.result;
  throw new ArcError(`${result.refusal.condition} ${result.refusal.remedy.text}`, "user.inbox-refused", { cause: result.refusal });
}
