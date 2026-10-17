/** Resolve state transport targets and state-only fetch negotiation. */

import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";

/** Read the target Git uses without importing transport settings from the code repository. */
export async function refFetchTarget(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<string> {
  if (remote.repository === "backing" || remote.name === designation.codeRemote) return remote.name;
  const source = context.repository?.source ?? context;
  return (await source.exec("git", ["remote", "get-url", remote.name], { cwd: context.checkoutRoot })).stdout.trim();
}

/** Restrict negotiation to state namespaces actually held by this store. */
export async function refFetchNegotiation(context: RefBackendContext, identity: string | null): Promise<string[]> {
  const patterns = ["refs/arc/work/*", "refs/arc/cohort/*", "refs/arc/archive/*", "refs/arc/project/*",
    "refs/arc/history/work/*", "refs/arc/history/cohort/*", "refs/arc-remotes/*",
    ...identity ? [`refs/arc/user/${identity}/personal*`, `refs/arc/user/${identity}/claims*`] : []];
  const { stdout } = await context.exec("git", ["for-each-ref", "--format=%(refname)", ...patterns.map((pattern) => pattern.slice(0, -1))],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const refs = stdout.split(/\r?\n/u).filter(Boolean);
  const held = patterns.filter((pattern) => refs.some((ref) => ref.startsWith(pattern.slice(0, -1))));
  return held.length > 0 ? held.map((pattern) => `--negotiation-tip=${pattern}`) : ["--negotiation-tip=refs/arc/work/*"];
}

/** Use Git's push URL for a designated code-repository remote outside the code remote. */
export async function refPushTarget(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation): Promise<string> {
  if (remote.repository === "backing" || remote.name === designation.codeRemote) return remote.name;
  const source = context.repository?.source ?? context;
  return (await source.exec("git", ["remote", "get-url", "--push", remote.name], { cwd: source.checkoutRoot })).stdout.trim();
}

