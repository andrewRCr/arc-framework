/** Settings of the separate store's own remote never strand code-held state. */

import type { StoreCommandResult, MigrateReport } from "../commands.js";
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation, refDesignationStop, type RefDesignation, type RefRemoteDesignation } from "./designation.js";
import { readRefRepository, writeRefRepository } from "./repository.js";
import { observeRefLayout, layoutRecoveryRemedy } from "./layout-state.js";
import { readSyncRefs } from "./sync-graph.js";
import { isStateRef } from "./manifest.js";
import { checkRemoteProject } from "./remote-project.js";
import { leaveRefSource } from "./leave-source.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { withRefFetchKeepers } from "./fetch-seen.js";
import { configureBackingRemote } from "./backing-configuration.js";

/** Check the pointer, physical layout and project before installing or changing backing. */
export async function setRefBacking(context: RefBackendContext, store: Store, designation: RefDesignation,
  role: "push" | "read" | "off"): Promise<StoreCommandResult<MigrateReport | null>> {
  const pointer = await context.backingRepository();
  const configured = refDesignationStop(designation);
  if (configured?.status === "move-incomplete") return heldStateRefusal(configured.condition);
  const publisher = designation.pushes.find(({ repository }) => repository === "code");
  if (publisher) return publisherRefusal(publisher, pointer);
  const physical = await readRefRepository(context);
  const layout = await observeRefLayout(context, designation);
  if (layout.incomplete || !physical.repository?.gitDir && [...(await readSyncRefs(physical, "refs/arc/"))]
    .some(([ref]) => isStateRef(ref))) return heldStateRefusal(layout.incomplete?.condition);
  if (!pointer && (!designation.backing || role === "push")) return noBackingPointer(context);
  const url = pointer ?? designation.backing?.url;
  if (!url) throw new Error("An admitted backing setting has no URL");
  if (role === "push") {
    const refused = await checkRemoteProject(context, { name: "backing", url, repository: "backing" }, designation);
    if (refused) return refused;
  }
  if (pointer && designation.backing && designation.backing.url !== pointer && role === "push") return leaveRefSource(context, store);
  return await applyBackingSetting(context, pointer, url, role) ?? { status: "ok", result: null };
}

type BackingRefusal = Extract<StoreCommandResult<null>, { status: "refused" }>;

function publisherRefusal(publisher: RefRemoteDesignation, pointer: string | null): BackingRefusal {
  return { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `${publisher.name} already carries push; backing needs a state move.`,
    remedy: { text: `Run arc store migrate --to ${pointer ?? "<URL>"} to move state and its designation.`,
      ...pointer ? { argv: ["arc", "store", "migrate", "--to", pointer] } : {} } } };
}

function heldStateRefusal(condition = "State remains in the code repository's refs; backing requires the separate store."): BackingRefusal {
  return { status: "refused", refusal: { code: "move-incomplete", class: "recoverable", condition, remedy: layoutRecoveryRemedy() } };
}

async function applyBackingSetting(context: RefBackendContext, pointer: string | null, url: string,
  role: "push" | "read" | "off"): Promise<BackingRefusal | undefined> {
  await writeRefRepository(context);
  const release = await context.lock("layout");
  try {
    // Another checkout may have designated a code remote, added backing, or placed state in the code repository meanwhile.
    const designation = await readRefDesignation(context), separate = await readRefRepository(context);
    const configured = refDesignationStop(designation);
    if (configured?.status === "move-incomplete") return heldStateRefusal(configured.condition);
    const publisher = designation.pushes.find(({ repository }) => repository === "code");
    if (publisher) return publisherRefusal(publisher, pointer);
    if (!separate.repository?.gitDir) return heldStateRefusal();
    await withRefFetchKeepers(separate, "backing", async () => {
      if (designation.backing && designation.backing.url !== url) {
        const tracking = await readSyncRefs(separate, "refs/arc-remotes/backing/");
        const seen = await readSyncRefs(separate, "refs/arc/tmp/seen/backing/");
        await requireLayoutTransaction(separate, [...tracking, ...seen].map(([ref, expected]) => ({ ref, expected, delete: true })));
      }
      await configureBackingRemote(separate, url, role);
    });
  } finally { await release(); }
  return undefined;
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
