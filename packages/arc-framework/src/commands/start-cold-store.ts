/** Cold-start preparation publishes its operational record only after local claims are ready. */
import type { Store } from "../lib/store/contract.js";
import type { ColdStartOutcome, ColdStartParams, ColdStartPassthrough } from "./start.js";
import type { SpawnWorktreeContext } from "../lib/git/worktree-scaffold.js";
import { scaffoldIntoWorktree } from "../lib/git/worktree-scaffold.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, removeWorktreeMarkerGeneration } from "../lib/git/worktree-marker.js";
import { writeEditorDocumentsOrThrow, nodeEditorDocumentsFs } from "../lib/schema-command/editor-documents.js";
import { createLocusPorts } from "../lib/locus/lifecycle-ports.js";
import { inspectCheckoutMarker } from "../lib/locus/marker-occupancy.js";
import { requireMarkerExclusivity } from "../lib/work-unit/locus-ports.js";
import { SlugSchema } from "../lib/kernel/index.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";

/** Anchor an existing checkout without changing its branch, HEAD, or tracked files. */
export async function runStoreColdStart(ctx: SpawnWorktreeContext, params: ColdStartParams, wuName: string,
  seed: { origin?: string; passthrough?: ColdStartPassthrough }): Promise<ColdStartOutcome> {
  const store = ctx.store;
  if (store === undefined) throw new Error("Store cold start requires an operational store");
  const ports = ctx.locusPorts ?? createLocusPorts({ cwd: params.worktreePath, exec: ctx.io.exec, store });
  let written: Buffer | undefined;
  try {
    const current = await resolveCurrentWorkUnit({ cwd: params.worktreePath, store });
    if (current.status === "ambiguous" || current.warnings.length > 0) return { ok: false, reason: `Work-unit occupancy is unresolved. ${current.warnings.join(" ")}` };
    const occupancy = await inspectCheckoutMarker({ cwd: params.worktreePath, store, identity: params.identity });
    if (occupancy.kind === "unreadable") return { ok: false, reason: occupancy.reason };
    if (occupancy.kind === "occupied" && (!occupancy.missingRecord || occupancy.marker.marker.spawnedByArc)) return { ok: false, reason: occupancy.reason };
    await requireMarkerExclusivity(ports, { name: wuName, checkoutPath: params.worktreePath });
    await ensureWorktreeMarkerIgnored(params.worktreePath, ctx.io.exec, nodeWorktreeMarkerIgnoreFs);
    await writeEditorDocumentsOrThrow(params.worktreePath, ctx.io.exec, nodeEditorDocumentsFs, undefined, ctx.writeEditorDocuments);
    const expected = occupancy.kind === "occupied" ? occupancy.marker.bytes : undefined;
    const marker = await ports.writeAnchoredMarker(params.worktreePath, { spawnedByArc: false,
      createdFor: { kind: "work-unit", name: wuName }, spawningIdentity: params.identity, createdAt: new Date().toISOString() },
    expected === undefined ? {} : { expected });
    if (marker.kind !== "created" && marker.kind !== "replaced") return { ok: false,
      reason: `Checkout ${params.worktreePath}'s anchored marker write refused (${marker.kind}). Inspect its marker and rerun.` };
    written = marker.bytes;
    await scaffoldIntoWorktree({ ...ctx, locusPorts: ports }, { worktreePath: params.worktreePath, branch: null,
      wuName, spawningIdentity: params.identity, createdByArc: false, origin: seed.origin });
    return { ok: true, value: { worktreePath: params.worktreePath, branch: params.branch, wuName, ...seed } };
  } catch (error) { return recoverColdStartFailure(store, params, wuName, written, error); }
}

async function recoverColdStartFailure(store: Store, params: ColdStartParams, wuName: string,
  written: Buffer | undefined, error: unknown): Promise<ColdStartOutcome> {
  const rollback = written === undefined ? "" : await rollbackMarker(params.worktreePath, written);
  const message = error instanceof Error ? error.message : String(error);
  if (params.name !== undefined) return { ok: false, reason: `${message}${rollback}` };
  try {
    const held = await store.lookup({ kind: "slug", slug: SlugSchema.parse(wuName) });
    if (held.status === "ok" && held.result.reference.kind === "work-item/meta") {
      const name = held.result.reference.owner.name;
      return { ok: false, reason: `Derived name '${wuName}' is held by work unit '${name}'. For a new work unit, run arc start <name> --new --here under another name. For '${name}', follow the lifecycle step shown by arc status ${name}.${rollback}` };
    }
  } catch { /* Preserve the original refusal when its follow-up inspection cannot resolve a name. */ }
  return { ok: false, reason: `${message}${rollback}` };
}
async function rollbackMarker(cwd: string, written: Buffer): Promise<string> {
  try {
    const removed = await removeWorktreeMarkerGeneration(cwd, written);
    return removed.kind === "removed" ? "" : ` The checkout's marker changed; inspect ${cwd} before retrying.`;
  } catch (error) { return ` Marker rollback failed at ${cwd}: ${error instanceof Error ? error.message : String(error)}. Inspect its marker before retrying.`; }
}
