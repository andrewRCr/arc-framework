/** Install a follow or source departure without changing the checkout's tracked pointer. */
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { readRefDesignation } from "./designation.js";
import { migrationCodeContext, type RecordedFollow, type RecordedLeaveSource } from "./migrate-record.js";
import { moveRefLayoutAsSwitch } from "./migrate-layout.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { configureBacking, installCopiedHeads, remoteLayoutCleanupComplete, removeBacking } from "./migrate-remote-switch.js";
import { readRefRepository } from "./repository.js";
import { readSyncRefs } from "./sync-graph.js";
import { captureMoveRemote } from "./migrate-remote-target.js";
import { MigrationRefusal } from "./migrate-refusal.js";

type RecordedSourceSwitch = RecordedFollow | RecordedLeaveSource;

/** Completion includes cleanup, designation, URLs, and removal of the old forwarding observation. */
export async function followSwitchComplete(context: RefBackendContext, recorded: RecordedSourceSwitch): Promise<boolean> {
  const { source, destination, sourceLayout, destinationLayout } = recorded.record;
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  const designation = await readRefDesignation(context), physical = await readRefRepository(context);
  if (Boolean(physical.repository?.gitDir) !== (destinationLayout === "separate")) return false;
  const selected = designation.remotes.find(row => row.name === destination.name && row.repository === destination.repository && row.role === answer);
  if (!selected) return false;
  const code = await migrationCodeContext(context), captured = await captureMoveRemote(context, code, selected);
  if (captured.fetchUrl !== destination.fetchUrl || captured.pushUrl !== destination.pushUrl) return false;
  if (source.repository === "code" && designation.codeRemotes.find(row => row.name === source.name)?.role !== "off") return false;
  if (source.repository === "backing" && destination.repository === "code" && designation.backing) return false;
  if ((await readSyncRefs(physical, `refs/arc-remotes/${source.name}/project/moved`)).size) return false;
  return remoteLayoutCleanupComplete(code, sourceLayout, destinationLayout);
}

/** The invoking checkout already supplies the pointer; following changes only clone-local designation and layout. */
export async function switchRefFollow(context: RefBackendContext, store: Store, recorded: RecordedSourceSwitch): Promise<void> {
  if (await followSwitchComplete(context, recorded)) return;
  const code = await migrationCodeContext(context), { sourceLayout, destinationLayout } = recorded.record;
  const configuration = {
    prepareTarget: async (target: RefBackendContext): Promise<void> => prepareFollowTarget(code, target, recorded),
    applyDesignation: async (): Promise<void> => applyFollowDesignation(context, recorded),
  };
  await context.migrateStep?.("follow.switch");
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

async function prepareFollowTarget(code: RefBackendContext, target: RefBackendContext, recorded: RecordedSourceSwitch): Promise<void> {
  const { source, destination } = recorded.record;
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  if (answer === "push") await installCopiedHeads(code, target, destination.name);
  if (destination.repository === "backing") await configureBacking(target, destination, answer);
  const roots = answer !== "push" && source.name === destination.name
    ? [`refs/arc-remotes/${source.name}/`, `refs/arc/tmp/seen/${source.name}/`] : [`refs/arc-remotes/${source.name}/project/moved`];
  for (const root of roots) await requireLayoutTransaction(target, [...await readSyncRefs(target, root)]
    .map(([ref, expected]) => ({ ref, expected, delete: true })));
}

async function applyFollowDesignation(context: RefBackendContext, recorded: RecordedSourceSwitch): Promise<void> {
  const { source, destination } = recorded.record, code = await migrationCodeContext(context);
  const answer = recorded.record.kind === "follow" ? recorded.record.answer : "push";
  if (source.repository === "code") await code.exec("git", ["config", `remote.${source.name}.arc-state`, "off"], { cwd: context.checkoutRoot });
  if (destination.repository === "code") {
    await code.exec("git", ["config", `remote.${destination.name}.arc-state`, answer], { cwd: context.checkoutRoot });
    await removeBacking(await readRefRepository(context));
  }
}
