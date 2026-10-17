/** Restartable local layout switches preserve the recorded direction until source cleanup ends. */

import { join } from "node:path";
import type { Store } from "../contract.js";
import type { MigrateReport, StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { directoryExists } from "./designation.js";
import { bindRefRepository } from "./repository-context.js";
import { readRefRepository } from "./repository.js";
import { migrationCodeContext, saveLayoutMoveRecord, removeLayoutMoveRecord, type RecordedLayout,
  type LayoutMoveRecord, type StoreLayout, type LayoutSetting } from "./migrate-record.js";
import { buildLayoutMove, layoutRefs, fetchLayoutObjects, requireLayoutTransaction, clearLayoutGathering, type LayoutBuild } from "./migrate-layout-build.js";

interface LayoutMoveState {
  context: RefBackendContext; code: RefBackendContext; record: LayoutMoveRecord;
  paths: { common: string; directory: string; build: string; aside: string };
}

/** Copy and switch under the layout lock, or finish the exact direction an earlier run recorded. */
export async function moveRefLayout(context: RefBackendContext, store: Store, destination: StoreLayout,
  setting?: LayoutSetting, resume?: RecordedLayout): Promise<StoreCommandResult<MigrateReport>> {
  const release = await context.lock("layout");
  try { return await moveHeldLayout(context, store, destination, setting, resume); }
  finally { await release(); }
}

async function moveHeldLayout(context: RefBackendContext, store: Store, destination: StoreLayout,
  setting?: LayoutSetting, resume?: RecordedLayout): Promise<StoreCommandResult<MigrateReport>> {
  const selected = await readRefRepository(context), code = await migrationCodeContext(context);
  const common = code.repository?.commonDir;
  if (!common) throw new Error("No physical code repository selected");
  const current = selected.repository?.gitDir ? "separate" : "default";
  if (!resume && current === destination) {
    if (setting) await setLayoutRole(code, setting);
    const removed = await cleanUnrecordedLayout(code, common, current);
    return { status: "ok", result: layoutReport(removed, undefined, "delete") };
  }
  const record: LayoutMoveRecord = resume?.record ?? { kind: "layout", source: current, destination, ...setting ? { setting } : {} };
  const paths = { common, directory: join(common, "arc", "store"), build: join(common, "arc", "store-migrate-build"), aside: join(common, "arc", "store-migrate-old") };
  const state = { context, code, record, paths };
  const directoryPresent = await directoryExists(code, paths.directory);
  const switched = record.destination === "separate" ? directoryPresent : !directoryPresent;
  const completed = switched ? await finishSwitchedLayout(state, resume) : await buildAndSwitchLayout(state, store, resume);
  await deleteLayoutSource(state, completed.recorded);
  return { status: "ok", result: completed.report };
}

async function cleanUnrecordedLayout(code: RefBackendContext, common: string, layout: StoreLayout): Promise<Map<string, string>> {
  await code.fs.removeDirectory(join(common, "arc", "store-migrate-build"));
  await code.fs.removeDirectory(join(common, "arc", "store-migrate-old"));
  await clearLayoutGathering(code, true);
  const removed = layout === "separate" ? await layoutRefs(code) : new Map<string, string>();
  await requireLayoutTransaction(code, [...removed].map(([ref, expected]) => ({ ref, delete: true, expected })));
  return removed;
}

async function buildAndSwitchLayout(state: LayoutMoveState, store: Store, resume?: RecordedLayout): Promise<{ recorded: RecordedLayout; report: MigrateReport }> {
  const { context, code, record, paths } = state;
  const source = bindRefRepository(context, paths.common, record.source === "separate" ? paths.directory : null);
  const prepared = await buildLayoutMove(code, source, store, record, paths.build);
  await context.migrateStep?.("layout.record");
  const recorded = await saveLayoutMoveRecord(code, record, resume?.tip ?? null);
  await switchLayout(code, prepared, recorded, paths.directory, paths.build, paths.aside);
  return { recorded, report: layoutReport(prepared.source, prepared) };
}

async function finishSwitchedLayout(state: LayoutMoveState, recorded?: RecordedLayout): Promise<{ recorded: RecordedLayout; report: MigrateReport }> {
  if (!recorded) throw new Error("A switched layout has no move record");
  const { context, code, record, paths } = state;
  let source: RefBackendContext | undefined;
  if (record.source === "default") source = code;
  else if (await directoryExists(code, paths.aside)) source = bindRefRepository(context, paths.common, paths.aside);
  const refs = source ? await layoutRefs(source) : new Map<string, string>();
  if (record.destination === "separate" && record.setting) {
    await context.migrateStep?.("layout.designation"); await setLayoutRole(code, record.setting);
  }
  return { recorded, report: layoutReport(refs) };
}

async function deleteLayoutSource(state: LayoutMoveState, recorded: RecordedLayout): Promise<void> {
  const { context, code, record, paths } = state;
  await context.migrateStep?.("layout.delete");
  if (record.source === "default") await requireLayoutTransaction(code, [...(await layoutRefs(code))].map(([ref, expected]) => ({ ref, delete: true, expected })));
  else await context.fs.removeDirectory(paths.aside);
  await context.fs.removeDirectory(paths.build);
  await clearLayoutGathering(code);
  await removeLayoutMoveRecord(code, recorded);
}

async function switchLayout(code: RefBackendContext, prepared: LayoutBuild, recorded: RecordedLayout,
  directory: string, build: string, aside: string): Promise<void> {
  const record = recorded.record;
  if (record.destination === "default") {
    await fetchLayoutObjects(code, build, prepared.planned);
    const changes = [...prepared.planned].map(([ref, next]) => ({ ref, next, expected: prepared.destination.get(ref) ?? null }));
    const removed = [...prepared.destination].filter(([ref]) => !prepared.planned.has(ref)).map(([ref, expected]) => ({ ref, delete: true as const, expected }));
    await requireLayoutTransaction(code, [...changes, ...removed]);
    if (record.setting) { await code.migrateStep?.("layout.designation"); await setLayoutRole(code, record.setting); }
  }
  await code.migrateStep?.("layout.rename");
  if (record.destination === "separate") await code.fs.rename(build, directory);
  else { await code.fs.removeDirectory(aside); await code.fs.rename(directory, aside); }
  if (record.destination === "separate" && record.setting) {
    await code.migrateStep?.("layout.designation"); await setLayoutRole(code, record.setting);
  }
}

async function setLayoutRole(context: RefBackendContext, setting: LayoutSetting): Promise<void> {
  await context.exec("git", ["config", `remote.${setting.remote}.arc-state`, setting.role], { cwd: context.checkoutRoot });
}

function layoutReport(refs: ReadonlyMap<string, string>, prepared?: LayoutBuild, sourceAction: "copy" | "delete" = "copy"): MigrateReport {
  const planned = prepared?.planned ?? refs;
  const written = new Map([...planned].map(([ref, tip]) => [ref,
    prepared?.destination.has(ref) && prepared.destination.get(ref) !== tip ? "merge" as const : sourceAction]));
  const rows: MigrateReport["refs"] = [...written].map(([ref, action]) => ({ ref, ...refScope(ref), action }));
  if (prepared) for (const ref of prepared.destination.keys()) {
    if (!prepared.planned.has(ref)) rows.push({ ref, ...refScope(ref), action: "delete" });
  }
  return { move: "layout", refs: rows, refused: [], brokenChains: [], reviewMapping: [], differingNotes: [], notices: prepared?.notices ?? [] };
}

function refScope(ref: string): { scope: "identity"; person: string } | { scope: "project" } {
  const person = /\/user\/([^/]+)\//u.exec(ref)?.[1];
  return person ? { scope: "identity", person } : { scope: "project" };
}
