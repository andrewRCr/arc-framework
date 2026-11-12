/** Repoint a backing remote without carrying its old publication grant onto the new URL. */

import { readSyncRefs } from "./sync-graph.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import type { RefBackendContext } from "./context.js";
import type { MoveRemote } from "./migrate-record.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { isCompletedGitFailure, isGitProcessError } from "../../git/process-error.js";
import { effectiveTransportCandidates, readRemoteTransports, resolveLiteralTransport } from "./effective-transport.js";

type BackingTarget = string | Pick<MoveRemote, "url" | "fetchUrl" | "pushUrl">;

/** The caller selects the physical repository and holds its layout and backing keeper leases. */
export async function configureBackingRemote(target: RefBackendContext, destination: BackingTarget, role: "push" | "read" | "off"): Promise<void> {
  const remote = typeof destination === "string" ? { url: destination,
    fetchUrl: (await resolveLiteralTransport(target, destination, "fetch"))[0] ?? destination,
    pushUrl: (await resolveLiteralTransport(target, destination, "push"))[0] ?? destination } : destination;
  const url = remote.url;
  const names = (await target.exec("git", ["remote"], { cwd: target.checkoutRoot })).stdout.split(/\r?\n/u);
  const exists = names.includes("backing");
  if (exists) await target.exec("git", ["config", "remote.backing.arc-state", "off"], { cwd: target.checkoutRoot });
  await target.exec("git", ["remote", exists ? "set-url" : "add", "backing", url], { cwd: target.checkoutRoot });
  await target.exec("git", ["config", "remote.backing.arc-state", "off"], { cwd: target.checkoutRoot });
  await target.exec("git", ["config", "--replace-all", "remote.backing.url", url], { cwd: target.checkoutRoot });
  await clearBackingPushUrls(target);
  await restoreBackingTransports(target, remote);
  await target.migrateStep?.("backing.repointed");
  await target.exec("git", ["config", "remote.backing.arc-state", role], { cwd: target.checkoutRoot });
}

/** Clear the previous receiver's comparison heads before exposing a different URL, under the caller's keeper lease. */
export async function repointBackingRemote(target: RefBackendContext, destination: BackingTarget, role: "push" | "read" | "off"): Promise<void> {
  const url = typeof destination === "string" ? destination : destination.url;
  const names = (await target.exec("git", ["remote"], { cwd: target.checkoutRoot })).stdout.split(/\r?\n/u);
  if (names.includes("backing")) {
    const previous = (await target.exec("git", ["config", "--null", "--get", "remote.backing.url"],
      { cwd: target.checkoutRoot, preserveOutput: true })).stdout.split("\0")[0];
    if (typeof destination === "string" && previous === url) {
      await target.exec("git", ["config", "remote.backing.arc-state", role], { cwd: target.checkoutRoot });
      return;
    }
    if (previous !== url) {
      const heads = await readSyncRefs(target, ["refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"]);
      await requireLayoutTransaction(target, [...heads].map(([ref, expected]) => ({ ref, expected, delete: true })));
    }
  }
  await configureBackingRemote(target, destination, role);
}

/** Completion requires one effective publication receiver as well as the configured fetch pointer. */
export async function backingTransportsMatch(target: RefBackendContext, destination: Pick<MoveRemote, "fetchUrl" | "pushUrl">): Promise<boolean> {
  const actual = await readRemoteTransports(target, "backing");
  return actual.fetchUrl === destination.fetchUrl && actual.pushUrls.length === 1 && actual.pushUrls[0] === destination.pushUrl;
}

async function clearBackingPushUrls(target: RefBackendContext): Promise<void> {
  try { await target.exec("git", ["config", "--unset-all", "remote.backing.pushurl"], { cwd: target.checkoutRoot }); }
  catch (error) { if (!isGitProcessError(error) || !isCompletedGitFailure(error) || error.exitCode !== 5) throw error; }
}

async function restoreBackingTransports(target: RefBackendContext, remote: Exclude<BackingTarget, string>): Promise<void> {
  if (await backingTransportsMatch(target, remote)) return;
  for (const raw of await effectiveTransportCandidates(target, remote.pushUrl, "fetch")) {
    await target.exec("git", ["config", "--replace-all", "remote.backing.pushurl", raw], { cwd: target.checkoutRoot });
    if (await backingTransportsMatch(target, remote)) return;
  }
  throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: `The backing transport cannot restore recorded fetch URL ${remote.fetchUrl} and push URL ${remote.pushUrl}; its role remains off.`,
    remedy: { text: "Repair the backing repository's URL rewrite configuration to restore those recorded endpoints, then retry arc store migrate. The pending migration record is retained.",
      argv: ["arc", "store", "migrate"] } });
}
