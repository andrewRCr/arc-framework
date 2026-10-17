/** Settings of the separate store's own remote never strand code-held state. */

import type { StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation } from "./designation.js";
import { readRefRepository, writeRefRepository } from "./repository.js";
import { observeRefLayout, layoutRecoveryRemedy } from "./layout-state.js";
import { readSyncRefs } from "./sync-graph.js";
import { isManifestRef } from "./manifest.js";
import { checkRemoteProject } from "./remote-project.js";

/** Check the pointer, physical layout and project before installing or changing backing. */
export async function setRefBacking(context: RefBackendContext, designation: RefDesignation,
  role: "push" | "read" | "off"): Promise<StoreCommandResult<null>> {
  const pointer = await context.backingRepository();
  const publisher = designation.pushes.find(({ repository }) => repository === "code");
  if (publisher) return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `${publisher.name} already carries push; backing needs a state move.`,
    remedy: { text: `Run arc store migrate --to ${pointer ?? "<URL>"} to move state and its designation.`,
      ...pointer ? { argv: ["arc", "store", "migrate", "--to", pointer] } : {} } } };
  const physical = await readRefRepository(context);
  const layout = await observeRefLayout(context, designation);
  if (layout.incomplete || !physical.repository?.gitDir && [...(await readSyncRefs(physical, "refs/arc/"))]
    .some(([ref]) => isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")))) return {
    status: "refused", refusal: { code: "move-incomplete", class: "recoverable",
      condition: layout.incomplete?.condition ?? "State remains in the code repository's refs; backing requires the separate store.",
      remedy: layoutRecoveryRemedy() },
  };
  if (!pointer && (!designation.backing || role === "push")) return noBackingPointer(context);
  if (pointer && designation.backing && designation.backing.url !== pointer) return { status: "refused", refusal: {
    code: "unsupported", class: "terminal", condition: "Repointing backing is not implemented.",
    remedy: { text: "Keep the current backing URL until backing repointing is available." },
  } };
  const url = pointer ?? designation.backing?.url;
  if (!url) throw new Error("An admitted backing setting has no URL");
  if (role === "push") {
    const refused = await checkRemoteProject(context, { name: "backing", url, repository: "backing" }, designation);
    if (refused) return refused;
  }
  const separate = await writeRefRepository(context);
  const release = await context.lock("layout");
  try {
    if (!designation.backing) await separate.exec("git", ["remote", "add", "backing", url]);
    await separate.exec("git", ["config", "remote.backing.arc-state", role]);
  } finally { await release(); }
  return { status: "ok", result: null };
}

async function noBackingPointer(context: RefBackendContext): Promise<Extract<StoreCommandResult<null>, { status: "refused" }>> {
  const names = (await context.exec("git", ["remote"], { cwd: context.checkoutRoot })).stdout.split(/\r?\n/u);
  const reserved = names.includes("backing");
  return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: "The invoking checkout's pointer names no backing repository.",
    remedy: reserved ? { text: "Run git remote rename backing state-source, then designate that code repository remote instead.",
      argv: ["git", "remote", "rename", "backing", "state-source"] }
      : { text: "Set the backing repository pointer before adding or designating backing, then retry." } } };
}
