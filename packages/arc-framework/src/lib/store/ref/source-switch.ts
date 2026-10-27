/** Install a follow or source departure without changing the checkout's tracked pointer. */
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation } from "./designation.js";
import { markSwitchBegun, migrationCodeContext, type RecordedFollow, type RecordedLeaveSource } from "./migrate-record.js";
import { moveRefLayoutAsSwitch } from "./migrate-layout.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { installCopiedHeads, remoteLayoutCleanupComplete, removeBacking } from "./migrate-remote-switch.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import type { SwitchUndo } from "./migrate-switch-undo.js";
import { withRefFetchKeepers } from "./fetch-seen.js";
import { backingTransportsMatch, configureBackingRemote, repointBackingRemote } from "./backing-configuration.js";

type RecordedSourceSwitch = RecordedFollow | RecordedLeaveSource;

/** Completion includes cleanup, designation, the configured URL, and removal of the old remote's forwarding observation the record names. */
export async function sourceSwitchComplete(context: RefBackendContext, recorded: RecordedSourceSwitch): Promise<boolean> {
  const { source, destination, sourceLayout, destinationLayout } = recorded.record;
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  const designation = await readRefDesignation(context), physical = await readRefRepository(context);
  if (Boolean(physical.repository?.gitDir) !== (destinationLayout === "separate")) return false;
  const selected = designation.remotes.find(row => row.name === destination.name && row.repository === destination.repository && row.role === answer);
  if (!selected) return false;
  if (selected.url !== destination.url) return false;
  if (destination.repository === "backing" && !await backingTransportsMatch(physical, destination)) return false;
  if (source.repository === "code" && designation.codeRemotes.find(row => row.name === source.name)?.role !== "off") return false;
  if (source.repository === "backing" && destination.repository === "code" && designation.backing) return false;
  // Between two backing repositories the old and new remote share a name, so only the recorded tip identifies the old observation.
  const moved = `refs/arc-remotes/${source.name}/project/moved`, observed = recorded.record.forwardingTip;
  if (observed && (await readSyncRefs(physical, moved)).get(moved) === observed) return false;
  return remoteLayoutCleanupComplete(await migrationCodeContext(context), sourceLayout, destinationLayout);
}

/** The invoking checkout already supplies the pointer; following changes only clone-local designation and layout. */
export async function switchRefSource(context: RefBackendContext, store: Store, recorded: RecordedSourceSwitch): Promise<void> {
  if (await sourceSwitchComplete(context, recorded)) return;
  const code = await migrationCodeContext(context), { sourceLayout, destinationLayout } = recorded.record;
  const configuration = {
    prepareTarget: async (target: RefBackendContext): Promise<void> => prepareSourceTarget(code, target, recorded),
    applyDesignation: async (): Promise<void> => applySourceDesignation(context, recorded),
  };
  await context.migrateStep?.("follow.switch");
  await markSwitchBegun(code, recorded);
  if (sourceLayout !== destinationLayout) {
    const result = await moveRefLayoutAsSwitch(context, store, sourceLayout, destinationLayout, recorded, configuration);
    if (result.status === "refused") throw new MigrationRefusal(result.refusal);
  } else {
    const release = await context.lock("layout");
    try { await configuration.prepareTarget(await readRefRepository(context)); await configuration.applyDesignation(); }
    finally { await release(); }
  }
  await context.migrateStep?.("follow.switched");
}

async function prepareSourceTarget(code: RefBackendContext, target: RefBackendContext, recorded: RecordedSourceSwitch): Promise<void> {
  const { source, destination } = recorded.record;
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  const replacingBacking = answer !== "push" && source.repository === "backing" && destination.repository === "backing";
  await withRefFetchKeepers(target, destination.name, async () => {
    if (answer === "push") await installCopiedHeads(code, target, destination.name);
    if (destination.repository === "backing") {
      if (replacingBacking) await repointBackingRemote(target, destination, answer);
      else await configureBackingRemote(target, destination, answer);
    }
  });
  if (replacingBacking) return;
  const roots = answer !== "push" && source.name === destination.name
    ? [`refs/arc-remotes/${source.name}/`, `refs/arc/tmp/seen/${source.name}/`] : [`refs/arc-remotes/${source.name}/project/moved`];
  await withRefFetchKeepers(target, source.name, async () => {
    for (const root of roots) await requireLayoutTransaction(target, [...await readSyncRefs(target, root)]
      .map(([ref, expected]) => ({ ref, expected, delete: true })));
  });
}

/** A follow's switch is undone to its old remote's recorded role and layout; the checkout's pointer stays as found. */
export function followSwitchUndo(recorded: RecordedFollow): SwitchUndo {
  const { source, destination, sourceRole, sourceLayout, destinationLayout } = recorded.record;
  return { recorded, source, destination, sourceRole, sourceLayout, destinationLayout };
}

async function applySourceDesignation(context: RefBackendContext, recorded: RecordedSourceSwitch): Promise<void> {
  const { source, destination } = recorded.record, code = await migrationCodeContext(context);
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  if (destination.repository === "code") await code.exec("git", ["config", `remote.${destination.name}.arc-state`, answer], { cwd: context.checkoutRoot });
  if (source.repository === "code") await code.exec("git", ["config", `remote.${source.name}.arc-state`, "off"], { cwd: context.checkoutRoot });
  if (destination.repository !== "code") return;
  // Without a store directory the physical repository is the code repository, whose remote named backing is the person's own.
  const physical = await readRefRepository(context);
  if (physical.repository?.gitDir) await removeBacking(physical);
}
