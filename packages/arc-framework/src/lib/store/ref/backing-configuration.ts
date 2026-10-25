/** Repoint a backing remote without carrying its old publication grant onto the new URL. */

import { readSyncRefs } from "./sync-graph.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import type { RefBackendContext } from "./context.js";

/** The caller selects the physical repository and holds its layout and backing keeper leases. */
export async function configureBackingRemote(target: RefBackendContext, url: string, role: "push" | "read" | "off"): Promise<void> {
  const names = (await target.exec("git", ["remote"], { cwd: target.checkoutRoot })).stdout.split(/\r?\n/u);
  const exists = names.includes("backing");
  if (exists) await target.exec("git", ["config", "remote.backing.arc-state", "off"], { cwd: target.checkoutRoot });
  await target.exec("git", ["remote", exists ? "set-url" : "add", "backing", url], { cwd: target.checkoutRoot });
  await target.migrateStep?.("backing.repointed");
  await target.exec("git", ["config", "remote.backing.arc-state", role], { cwd: target.checkoutRoot });
}

/** Clear the previous receiver's comparison heads before exposing a different URL, under the caller's keeper lease. */
export async function repointBackingRemote(target: RefBackendContext, url: string, role: "push" | "read" | "off"): Promise<void> {
  const names = (await target.exec("git", ["remote"], { cwd: target.checkoutRoot })).stdout.split(/\r?\n/u);
  if (names.includes("backing")) {
    const previous = (await target.exec("git", ["remote", "get-url", "backing"], { cwd: target.checkoutRoot })).stdout.trim();
    if (previous !== url) {
      const heads = await readSyncRefs(target, ["refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"]);
      await requireLayoutTransaction(target, [...heads].map(([ref, expected]) => ({ ref, expected, delete: true })));
    }
  }
  await configureBackingRemote(target, url, role);
}
