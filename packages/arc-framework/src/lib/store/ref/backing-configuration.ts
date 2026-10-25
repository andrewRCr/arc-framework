/** Repoint a backing remote without carrying its old publication grant onto the new URL. */

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
