/** Observe physical layout mismatches and unfinished source cleanup before state transport. */

import type { RefBackendContext } from "./context.js";
import type { RefDesignation } from "./designation.js";
import { isManifestRef } from "./manifest.js";
import { migrationCodeContext, MOVE_REF, type StoreLayout } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import type { Remedy } from "../refusal.js";
import type { SyncState } from "../sync.js";

/** Only the code remote's sole push designation places the store in the code repository. */
export function designatedStoreLayout(designation: RefDesignation): StoreLayout {
  return designation.backing?.role !== "push" && designation.pushes.length === 1 && designation.pushes[0]?.name === designation.codeRemote ? "default" : "separate";
}

/** The no-target command finishes a recorded switch and any remaining source cleanup. */
export function layoutRecoveryRemedy(): Remedy {
  return { text: "Run arc store migrate to finish the recorded move or align the layout; undo an unintended remote edit before retrying instead.",
    argv: ["arc", "store", "migrate"] };
}

type LayoutCondition = Omit<Extract<SyncState, { status: "move-incomplete" | "move-unfinished" }>, "status">;

/** Detect configuration/physical disagreement without creating a directory or consulting any remote. */
export async function observeRefLayout(context: RefBackendContext, designation: RefDesignation): Promise<{
  incomplete?: LayoutCondition & { status: "move-incomplete" };
  unfinished?: LayoutCondition & { status: "move-unfinished" };
}> {
  const physical = await readRefRepository(context), code = await migrationCodeContext(context);
  const refs = await readSyncRefs(code, "refs/arc/");
  const held = [...refs.keys()].some((ref) => isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")));
  const separate = Boolean(physical.repository?.gitDir);
  const recorded = refs.has(MOVE_REF);
  const unfinished = recorded || separate && held ? { status: "move-unfinished" as const,
    condition: recorded ? "A recorded store move still has steps or source cleanup to finish." : "Store refs remain in the code repository beside the separate store directory.",
    remedy: layoutRecoveryRemedy() } : undefined;
  const declared = designation.remotes.some(({ role }) => role !== undefined);
  const expected = designatedStoreLayout(designation);
  if (declared && (expected === "default" ? separate : !separate && held)) return {
    unfinished, incomplete: { status: "move-incomplete",
      condition: separate ? "The store is in the separate store directory while its designation requires the code repository's refs."
        : "The store remains in the code repository's refs while its designation requires a separate store directory.",
      remedy: layoutRecoveryRemedy() },
  };
  return { unfinished };
}
