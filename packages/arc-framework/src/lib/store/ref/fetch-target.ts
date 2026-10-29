/** Resolve state transport targets and state-only fetch negotiation. */

import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { retryTornRefListing } from "../../git/ref-listing.js";
import { gitRefLockArgs } from "../../git/ref-transaction.js";
import { readNamedTransport, selectLiteralTransport } from "./effective-transport.js";

/** Read the target Git uses without importing transport settings from the code repository. */
export async function refFetchTarget(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<string> {
  if (remote.repository === "backing" || remote.name === designation.codeRemote && !context.repository?.gitDir) return remote.name;
  const source = context.repository?.source ?? context;
  const effective = (await readNamedTransport(source, remote.name, "fetch"))[0];
  if (!effective) throw new Error(`Remote ${remote.name} has no effective fetch URL. Repair its URL and retry.`);
  return selectLiteralTransport(context, effective, "fetch");
}

/**
 * The one argument list a store fetch of named refs runs: no configured refmap, tags, tag pruning, filter, or
 * FETCH_HEAD, which belong to the person's own fetches, and per-ref porcelain over forced-update checks. Omitted
 * refspecs select owned stdin; explicit refspecs render bounded, directly executable repair commands.
 */
export function refFetchArgs(remote: string, negotiation: readonly string[], target: string, refspecs?: readonly string[]): string[] {
  return [...gitRefLockArgs(), "-c", `remote.${remote}.negotiationInclude=`, "fetch", "--refmap=", "--no-tags", "--no-filter",
    "--no-write-fetch-head", "--prune", "--no-prune-tags", "--show-forced-updates", "--porcelain", "--verbose", ...negotiation, ...(refspecs === undefined ? ["--stdin"] : []), "--", target, ...(refspecs ?? [])];
}

/** Restrict negotiation to state namespaces actually held by this store. */
export async function refFetchNegotiation(context: RefBackendContext, identity: string | null): Promise<string[]> {
  const patterns = ["refs/arc/work/*", "refs/arc/cohort/*", "refs/arc/archive/*", "refs/arc/project/*",
    "refs/arc/history/work/*", "refs/arc/history/cohort/*", "refs/arc-remotes/*",
    ...identity ? [`refs/arc/user/${identity}/personal*`, `refs/arc/user/${identity}/claims*`] : []];
  const { stdout } = await retryTornRefListing(() => context.exec("git", ["for-each-ref", "--format=%(refname)",
    ...patterns.map((pattern) => pattern.slice(0, -1))], { cwd: context.checkoutRoot, objectAccess: "local-only" }));
  const refs = stdout.split(/\r?\n/u).filter(Boolean);
  const held = patterns.filter((pattern) => refs.some((ref) => ref.startsWith(pattern.slice(0, -1))));
  return held.length > 0 ? held.map((pattern) => `--negotiation-tip=${pattern}`) : ["--negotiation-tip=refs/arc/work/*"];
}

/** Use Git's push URL for a designated code-repository remote outside the code remote. */
export async function refPushTarget(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation): Promise<string> {
  if (remote.repository === "backing" || remote.name === designation.codeRemote) return remote.name;
  const source = context.repository?.source ?? context;
  const effective = (await readNamedTransport(source, remote.name, "push"))[0];
  if (!effective) throw new Error(`Remote ${remote.name} has no effective push URL. Repair its URL and retry.`);
  return selectLiteralTransport(context, effective, "push");
}

