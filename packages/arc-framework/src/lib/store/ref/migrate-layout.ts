/** Restartable local layout switches preserve the recorded direction until source cleanup ends. */

import { MigrationRefusal } from "./migrate-refusal.js";
import { join } from "node:path";
import type { Store } from "../contract.js";
import type { MigrateReport, StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { directoryExists } from "./designation.js";
import { bindRefRepository } from "./repository-context.js";
import { readRefRepository } from "./repository.js";
import { migrationCodeContext, saveMoveRecord, removeMoveRecord, readMoveRecord, readMoveReport, type RecordedLayout,
  type LayoutMoveRecord, type StoreLayout, type LayoutSetting, type RecordedMove } from "./migrate-record.js";
import { buildLayoutMove, layoutRefs, fetchLayoutObjects, requireLayoutTransaction, clearLayoutGathering, type LayoutBuild } from "./migrate-layout-build.js";

interface LayoutMoveState {
  context: RefBackendContext; code: RefBackendContext; record: LayoutMoveRecord;
  paths: { common: string; directory: string; build: string; aside: string };
  configuration?: LayoutSwitchConfiguration;
}

/** Copy and switch under the layout lock, or finish the exact direction an earlier run recorded. */
export async function moveRefLayout(context: RefBackendContext, store: Store, destination: StoreLayout,
  setting?: LayoutSetting, resume?: RecordedLayout): Promise<StoreCommandResult<MigrateReport>> {
  const release = await context.lock("layout");
  try { return await moveHeldLayout(context, store, destination, setting, resume); }
  catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    await cleanRefusedUnrecordedLayout(context);
    return { status: "refused", refusal: error.refusal };
  }
  finally { await release(); }
}

async function cleanRefusedUnrecordedLayout(context: RefBackendContext): Promise<void> {
  const code = await migrationCodeContext(context), held = await readMoveRecord(code);
  if (held.status !== "ok" || held.result) return;
  const common = code.repository?.commonDir;
  if (!common) throw new Error("No physical code repository selected");
  await code.fs.removeDirectory(join(common, "arc", "store-migrate-build"));
  await clearLayoutGathering(code, true);
}

/** A containing remote move prepares the unexposed target and applies its ordered designation. */
export interface LayoutSwitchConfiguration {
  prepareTarget(target: RefBackendContext): Promise<void>;
  applyDesignation(): Promise<void>;
}

/** Borrow the remote move's record while retaining the layout engine's commit serialization. */
export async function moveRefLayoutAsSwitch(context: RefBackendContext, store: Store, source: StoreLayout,
  destination: StoreLayout, parent: RecordedMove, configuration: LayoutSwitchConfiguration): Promise<StoreCommandResult<MigrateReport>> {
  const release = await context.lock("layout");
  try { return await moveHeldLayout(context, store, destination, undefined,
    { record: { kind: "layout", source, destination }, tip: parent.tip }, configuration); }
  catch (error) { if (error instanceof MigrationRefusal) return { status: "refused", refusal: error.refusal }; throw error; }
  finally { await release(); }
}

async function moveHeldLayout(context: RefBackendContext, store: Store, destination: StoreLayout,
  setting?: LayoutSetting, resume?: RecordedLayout, configuration?: LayoutSwitchConfiguration): Promise<StoreCommandResult<MigrateReport>> {
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
  const state = { context, code, record, paths, configuration };
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
  const prepared = await buildLayoutMove(code, source, store, record, paths.build, state.configuration !== undefined);
  if (state.configuration) { await state.configuration.prepareTarget(prepared.context); prepared.planned = await layoutRefs(prepared.context); }
  await context.migrateStep?.("layout.record");
  const report = layoutReport(prepared.source, prepared);
  const recorded = state.configuration ? resume : await saveMoveRecord(code, record, resume?.tip ?? null, report);
  if (!recorded) throw new Error("A containing move must retain its record");
  await switchLayout(state, prepared, recorded);
  return { recorded, report };
}

async function finishSwitchedLayout(state: LayoutMoveState, recorded?: RecordedLayout): Promise<{ recorded: RecordedLayout; report: MigrateReport }> {
  if (!recorded) throw new Error("A switched layout has no move record");
  const { context, code, record, paths } = state;
  let source: RefBackendContext | undefined;
  if (record.source === "default") source = code;
  else if (await directoryExists(code, paths.aside)) source = bindRefRepository(context, paths.common, paths.aside);
  // The record keeps the report its build made, since the source may already be partly or wholly deleted.
  const kept = state.configuration ? null : await readMoveReport(code, recorded.tip);
  const refs = kept || !source ? new Map<string, string>() : await layoutRefs(source);
  if (record.destination === "separate" && (record.setting || state.configuration)) await applyLayoutDesignation(state);
  return { recorded, report: kept ?? layoutReport(refs) };
}

async function deleteLayoutSource(state: LayoutMoveState, recorded: RecordedLayout): Promise<void> {
  const { context, code, record, paths } = state;
  await context.migrateStep?.("layout.delete");
  if (record.source === "default") await requireLayoutTransaction(code, [...(await layoutRefs(code))].map(([ref, expected]) => ({ ref, delete: true, expected })));
  // An undo out of the code repository's refs can find the directory an interrupted move into them set aside.
  await context.fs.removeDirectory(paths.aside);
  await context.fs.removeDirectory(paths.build);
  await context.migrateStep?.("layout.deleted");
  await clearLayoutGathering(code, state.configuration !== undefined);
  if (!state.configuration) await removeMoveRecord(code, recorded);
}

async function switchLayout(state: LayoutMoveState, prepared: LayoutBuild, recorded: RecordedLayout): Promise<void> {
  const { code, paths: { directory, build, aside } } = state;
  const record = recorded.record;
  if (record.destination === "default") {
    await fetchLayoutObjects(code, build, prepared.planned);
    const changes = [...prepared.planned].map(([ref, next]) => ({ ref, next, expected: prepared.destination.get(ref) ?? null }));
    const removed = [...prepared.destination].filter(([ref]) => !prepared.planned.has(ref)).map(([ref, expected]) => ({ ref, delete: true as const, expected }));
    await requireLayoutTransaction(code, [...changes, ...removed]);
    if (record.setting || state.configuration) await applyLayoutDesignation(state);
  }
  await code.migrateStep?.("layout.rename");
  if (record.destination === "separate") await code.fs.rename(build, directory);
  else { await code.fs.removeDirectory(aside); await code.fs.rename(directory, aside); }
  if (record.destination === "separate" && (record.setting || state.configuration)) await applyLayoutDesignation(state);
}

async function setLayoutRole(context: RefBackendContext, setting: LayoutSetting): Promise<void> {
  await context.exec("git", ["config", `remote.${setting.remote}.arc-state`, setting.role], { cwd: context.checkoutRoot });
}

function layoutReport(refs: ReadonlyMap<string, string>, prepared?: LayoutBuild, sourceAction: "copy" | "delete" = "copy"): MigrateReport {
  const planned = prepared?.planned ?? refs;
  const written = new Map([...planned].filter(([ref, tip]) => refs.has(ref) || prepared?.destination.get(ref) !== tip).map(([ref, tip]) => [ref,
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

async function applyLayoutDesignation(state: LayoutMoveState): Promise<void> {
  await state.context.migrateStep?.("layout.designation");
  if (state.configuration) await state.configuration.applyDesignation();
  else if (state.record.setting) await setLayoutRole(state.code, state.record.setting);
}
