/** Explicit state-only fetches into an isolated tracking namespace. */

import type { HistoryRef } from "../refusal.js";
import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import { gitRefLockArgs } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";

/** Fetch registered state and explicitly requested history without configured refmaps or code negotiation. */
export async function fetchRefRemote(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, history: readonly HistoryRef[] = [], signal?: AbortSignal): Promise<FetchOutcome> {
  const identity = remote.role === "read" ? null : await context.identity();
  const patterns = ["refs/arc/work/*", "refs/arc/cohort/*", "refs/arc/archive/*", "refs/arc/project/*",
    ...identity ? [`refs/arc/user/${identity}/personal*`, `refs/arc/user/${identity}/claims*`] : [],
    ...new Set(history.map((ref) => `${ref}*`))];
  return fetchRefPatterns(context, remote, designation, patterns, identity, signal);
}

/** Fetch a discovered set of histories without changing the namespace snapshot being reconciled. */
export async function fetchRefHistories(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation, history: readonly HistoryRef[], signal?: AbortSignal): Promise<FetchOutcome> {
  return fetchRefPatterns(context, remote, designation, [...new Set(history.map((ref) => `${ref}*`))],
    remote.role === "read" ? null : await context.identity(), signal);
}

async function fetchRefPatterns(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  patterns: readonly string[], identity: string | null, signal?: AbortSignal): Promise<FetchOutcome> {
  const negotiation = await negotiationArgs(context, identity);
  const source = context.repository?.source ?? context;
  const target = remote.repository === "backing" || remote.name === designation.codeRemote ? remote.name
    : (await source.exec("git", ["remote", "get-url", remote.name], { cwd: context.checkoutRoot })).stdout.trim();
  const args = [...gitRefLockArgs(), "-c", `remote.${remote.name}.negotiationInclude=`, "fetch", "--refmap=", "--no-tags",
    "--no-filter", "--prune", "--show-forced-updates", "--porcelain", "--verbose", ...negotiation, "--", target,
    ...patterns.map((pattern) => `${pattern}:refs/arc-remotes/${remote.name}/${pattern.slice("refs/arc/".length)}`)];
  try {
    return parseFetchPorcelain(await context.exec("git", args, { cwd: context.checkoutRoot, signal,
      diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true }));
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    const outcome = parseFetchPorcelain(failure);
    return outcome.status === "unreachable" && failure.kind === "canceled" && signal?.aborted
      ? { ...outcome, cause: "timeout" } : outcome;
  }
}

async function negotiationArgs(context: RefBackendContext, identity: string | null): Promise<string[]> {
  const patterns = ["refs/arc/work/*", "refs/arc/cohort/*", "refs/arc/archive/*", "refs/arc/project/*",
    "refs/arc/history/work/*", "refs/arc/history/cohort/*", "refs/arc-remotes/*",
    ...identity ? [`refs/arc/user/${identity}/personal*`, `refs/arc/user/${identity}/claims*`] : []];
  const { stdout } = await context.exec("git", ["for-each-ref", "--format=%(refname)", ...patterns.map((pattern) => pattern.slice(0, -1))],
    { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const refs = stdout.split(/\r?\n/u).filter(Boolean);
  const held = patterns.filter((pattern) => refs.some((ref) => ref.startsWith(pattern.slice(0, -1))));
  return held.length > 0 ? held.map((pattern) => `--negotiation-tip=${pattern}`) : ["--negotiation-tip=refs/arc/work/*"];
}
