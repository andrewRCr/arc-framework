/** Undo a switch another move overtook, from what the overtaken move's record can say. */
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { readRefRepository } from "./repository.js";
import { migrationCodeContext, switchMarked, type MoveRemote, type RecordedMove, type StoreLayout } from "./migrate-record.js";
import { moveRefLayoutAsSwitch } from "./migrate-layout.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { configureBacking, removeBacking, writeMovePointer } from "./migrate-remote-switch.js";
import { readSyncRefs } from "./sync-graph.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { withRefFetchKeepers } from "./fetch-seen.js";

/** What a switch changes and what its undo returns to; a follow writes no pointer. */
export interface SwitchUndo {
  recorded: RecordedMove;
  source: MoveRemote; destination: MoveRemote;
  sourceRole: "push" | "read";
  sourceLayout: StoreLayout; destinationLayout: StoreLayout;
  pointer?: { source: string | null };
}

/** A switch began once it marked its record, which it does before its first write; the mark stays until the record goes. */
export async function switchBegun(context: RefBackendContext, recorded: RecordedMove): Promise<boolean> {
  return switchMarked(await migrationCodeContext(context), recorded);
}

/** Return the source's layout, designation, and pointer, carrying writes made since back with the layout. */
export async function undoSwitch(context: RefBackendContext, store: Store, undo: SwitchUndo): Promise<boolean> {
  if (!await switchBegun(context, undo.recorded)) return false;
  if (undo.sourceLayout !== undo.destinationLayout) {
    const moved = await moveRefLayoutAsSwitch(context, store, undo.destinationLayout, undo.sourceLayout, undo.recorded, {
      prepareTarget: async (target: RefBackendContext): Promise<void> => {
        await dropCarriedHeads(target, undo);
        if (undo.source.repository === "backing") await configureBacking(target, undo.source, undo.sourceRole);
      },
      applyDesignation: async (): Promise<void> => restoreDesignation(context, undo),
    });
    if (moved.status === "refused") throw new MigrationRefusal(moved.refusal);
  }
  const release = await context.lock("layout");
  try { await restoreDesignation(context, undo); await dropCarriedHeads(await readRefRepository(context), undo); }
  finally { await release(); }
  if (undo.pointer) await writeMovePointer(context, undo.pointer.source);
  return true;
}

/** The source carries its role again before a code remote destination takes `off`, as a move the other way sets them. */
async function restoreDesignation(context: RefBackendContext, undo: SwitchUndo): Promise<void> {
  const code = await migrationCodeContext(context), physical = await readRefRepository(context);
  const separate = Boolean(physical.repository?.gitDir);
  if (undo.source.repository === "code") await code.exec("git", ["config", `remote.${undo.source.name}.arc-state`, undo.sourceRole], { cwd: context.checkoutRoot });
  else if (separate) await configureBacking(physical, undo.source, undo.sourceRole);
  if (undo.destination.repository === "code") await code.exec("git", ["config", `remote.${undo.destination.name}.arc-state`, "off"], { cwd: context.checkoutRoot });
  else if (undo.source.repository === "code" && separate) await removeBacking(physical);
}

async function dropCarriedHeads(target: RefBackendContext, undo: SwitchUndo): Promise<void> {
  if (undo.destination.name === undo.source.name) return;
  await withRefFetchKeepers(target, undo.destination.name, async () => {
    for (const root of [`refs/arc-remotes/${undo.destination.name}/`, `refs/arc/tmp/seen/${undo.destination.name}/`]) {
      await requireLayoutTransaction(target, [...await readSyncRefs(target, root)].map(([ref, expected]) => ({ ref, expected, delete: true as const })));
    }
  });
}
