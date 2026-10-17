/** Render exact, lease-bound choices for a remote rewrite without choosing one for the caller. */

import { quoteShellArgument } from "../../release/commit-message-retry.js";
import { gitRefLockArgs } from "../../git/ref-transaction.js";
import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { refFetchNegotiation, refFetchTarget, refPushTarget } from "./fetch-target.js";
import { readSyncRefs } from "./sync-graph.js";

/** Keep every command in the selected store repository and protect later local or remote changes. */
export async function refFetchRewriteRemedy(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, ref: string, observed: string): Promise<Remedy> {
  const git = ["git", ...context.repository?.gitDir ? [`--git-dir=${context.repository.gitDir}`] : []];
  const command = (args: string[]) => [...git, ...args].map(quoteShellArgument).join(" ");
  const target = await refFetchTarget(context, remote, designation);
  const local = (await readSyncRefs(context, ref)).get(ref);
  const tracking = `refs/arc-remotes/${remote.name}/${ref.slice("refs/arc/".length)}`;
  const negotiation = await refFetchNegotiation(context, remote.role === "read" ? null : await context.identity());
  const fetch = command([...gitRefLockArgs(), "-c", `remote.${remote.name}.negotiationInclude=`, "fetch", "--refmap=", "--no-tags",
    "--no-filter", "--prune", "--show-forced-updates", "--porcelain", "--verbose", ...negotiation, "--", target, `+${ref}:${tracking}`]);
  const keep = command(["push", `--force-with-lease=${ref}:${observed}`, "--", await refPushTarget(context, remote, designation), `${local ?? ""}:${ref}`]);
  const take = command(["update-ref", ref, tracking, local ?? "0".repeat(observed.length)]);
  return { text: `Keep ours (discard the remote rewrite):\n${keep}\nTake theirs (discard this ref's local changes):\n${fetch}\n${take}`
    + `\nMerge both (retain both histories):\n${fetch}\nThen pull state again to merge the fetched history.` };
}
