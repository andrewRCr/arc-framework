/** Git's push event and the equivalent native pre-commit.com environment. */
import { isGitObjectId } from "../git/object-id.js";
/** One proposed ref update; omitted coordinates are resolved from the local ref. */
export interface PushRefUpdate { localRef: string; localOid?: string; remoteRef?: string; remoteOid?: string }
/** One hook event, captured before running its gate. */
export interface PushEvent { remote?: string; url?: string; refs: PushRefUpdate[] }
/** One ref's reported gate disposition. */
export interface PushRefDisposition { ref: string; outcome: "checked" | "skipped" | "not selected"; reason?: string }

/**
 * Exclude state refs and ref deletions before resolving any checked content.
 * @param update - Proposed Git ref update
 * @param currentRef - Current checkout's branch ref, or null for a detached checkout
 * @returns The ref's gate disposition
 */
export function classifyPushRef(update: PushRefUpdate, currentRef?: string | null): PushRefDisposition {
  if (update.localRef.startsWith("refs/arc/") || update.remoteRef?.startsWith("refs/arc/")) {
    return { ref: update.localRef, outcome: "skipped", reason: "state ref" };
  }
  if (update.localOid !== undefined && /^0+$/u.test(update.localOid)) {
    return { ref: update.localRef, outcome: "skipped", reason: "ref deletion" };
  }
  // Git preserves HEAD as the source spelling in hook input even when it names the checkout branch.
  const sourceRef = update.localRef === "HEAD" ? currentRef : update.localRef;
  if (!sourceRef?.startsWith("refs/heads/") || sourceRef !== currentRef) return { ref: update.localRef, outcome: "not selected",
    reason: "no worktree for this pushed ref in the current checkout" };
  return { ref: update.localRef, outcome: "checked" };
}

/**
 * Capture explicit ref input or the hook manager's equivalent environment.
 * @param stdin - Complete Git push protocol input
 * @param remote - Optional positional remote name
 * @param url - Optional positional remote URL
 * @param environment - Captured process environment
 * @returns Remote identity and proposed ref updates
 */
export function readPushEvent(stdin: string, remote: string | undefined, url: string | undefined, environment: NodeJS.ProcessEnv): PushEvent {
  const refs = stdin.trim().split(/\r?\n/u).filter(line => line.trim() !== "").map(parsePushRef);
  const managerRef = refs.length === 0 ? readManagerPushRef(environment) : undefined;
  if (managerRef !== undefined) refs.push(managerRef);
  return { remote: remote || environment.PRE_COMMIT_REMOTE_NAME, url: url || environment.PRE_COMMIT_REMOTE_URL, refs };
}

function parsePushRef(line: string): PushRefUpdate {
  const fields = line.trim().split(/[ \t]+/u);
  const [localRef, localOid, remoteRef, remoteOid] = fields;
  if (fields.length !== 4 || !localRef || !remoteRef || !isGitObjectId(localOid ?? "") || !isGitObjectId(remoteOid ?? "")) {
    throw new Error("Malformed Git push ref input; retry git push with Git's complete ref lines.");
  }
  return { localRef, localOid, remoteRef, remoteOid };
}

function readManagerPushRef(environment: NodeJS.ProcessEnv): PushRefUpdate | undefined {
  const localRef = environment.PRE_COMMIT_LOCAL_BRANCH;
  if (!localRef) return undefined;
  const from = environment.PRE_COMMIT_FROM_REF, to = environment.PRE_COMMIT_TO_REF;
  if ((from !== undefined || to !== undefined) && (!isGitObjectId(from ?? "") || !isGitObjectId(to ?? ""))) {
    throw new Error("Malformed pre-commit.com push range; repair its ref metadata or supply Git's complete ref lines and retry git push.");
  }
  return { localRef, remoteRef: environment.PRE_COMMIT_REMOTE_BRANCH, localOid: to, remoteOid: from };
}
