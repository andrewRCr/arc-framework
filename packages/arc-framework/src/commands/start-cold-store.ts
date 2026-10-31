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
import { checkCreationAdmission, renderCreationAdmissionRefusal } from "../lib/store/creation-admission.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import type { OwnerIdentity } from "../lib/store/identity.js";
import { stampCreatedWorkUnitMarker } from "../lib/work-unit/created-work-unit-marker.js";

/** Anchor an existing checkout without changing its branch, HEAD, or tracked files. */
export async function runStoreColdStart(ctx: SpawnWorktreeContext, params: ColdStartParams, wuName: string,
  seed: { origin?: string; passthrough?: ColdStartPassthrough }): Promise<ColdStartOutcome> {
  const store = ctx.store;
  if (store === undefined) throw new Error("Store cold start requires an operational store");
  const ports = ctx.locusPorts ?? createLocusPorts({ cwd: params.worktreePath, exec: ctx.io.exec, store });
  let written: Buffer | undefined;
  let owner: OwnerIdentity | undefined;
  try {
    const current = await resolveCurrentWorkUnit({ cwd: params.worktreePath, store });
    if (current.status === "ambiguous" || current.warnings.length > 0) return { ok: false, reason: `Work-unit occupancy is unresolved. ${current.warnings.join(" ")}` };
    const occupancy = await inspectCheckoutMarker({ cwd: params.worktreePath, store, identity: params.identity });
    if (occupancy.kind === "unreadable") return { ok: false, reason: occupancy.reason };
    if (occupancy.kind === "occupied" || (occupancy.kind === "unbound" && occupancy.unbound.exit.kind !== "rerun")) return { ok: false, reason: occupancy.reason };
    const admission = await coldStartNameRefusal(store, wuName, params.name !== undefined);
    if (admission !== null) return { ok: false, reason: admission };
    await requireMarkerExclusivity(ports, { kind: "creation", slug: wuName, checkoutPath: params.worktreePath });
    await ensureWorktreeMarkerIgnored(params.worktreePath, ctx.io.exec, nodeWorktreeMarkerIgnoreFs);
    await writeEditorDocumentsOrThrow(params.worktreePath, ctx.io.exec, nodeEditorDocumentsFs, undefined, ctx.writeEditorDocuments);
    const expected = occupancy.kind === "unbound" ? occupancy.marker.bytes : undefined;
    const marker = await ports.writeAnchoredMarker(params.worktreePath, { spawnedByArc: false,
      createdFor: { kind: "work-unit", name: wuName }, spawningIdentity: params.identity, createdAt: new Date().toISOString() },
    expected === undefined ? {} : { expected });
    if (marker.kind !== "created" && marker.kind !== "replaced") return { ok: false,
      reason: `Checkout ${params.worktreePath}'s anchored marker write refused (${marker.kind}). Inspect its marker and rerun.` };
    written = marker.bytes;
    owner = await scaffoldIntoWorktree({ ...ctx, locusPorts: ports }, { worktreePath: params.worktreePath, branch: null,
      wuName, spawningIdentity: params.identity, createdByArc: false, origin: seed.origin });
  } catch (error) { return recoverColdStartFailure(params, written, error); }
  const refusal = await stampCreatedWorkUnitMarker({ cwd: params.worktreePath, name: wuName, expected: written, owner });
  return refusal === null ? { ok: true, value: { worktreePath: params.worktreePath, branch: params.branch, wuName, ...seed } }
    : { ok: false, reason: refusal };
}

async function coldStartNameRefusal(store: Store, name: string, named: boolean): Promise<string | null> {
  const admission = await checkCreationAdmission(store, name);
  if (admission.kind === "free") return null;
  const rendered = renderCreationAdmissionRefusal(name, admission);
  if (named) return `${rendered.condition} ${rendered.remedy.text}`;
  const holder = !admission.ambiguous && admission.holders.length === 1 ? admission.holders[0] : undefined;
  const pointer = admission.kind === "held" && holder?.reference.kind === "work-item/meta"
    ? ` For '${holder.reference.owner.name}', follow the lifecycle step shown by arc status ${holder.reference.owner.name}.` : "";
  return `${rendered.condition} ${rendered.remedy.text} For a new work unit, run arc start <name> --new --here under another name.${pointer}`;
}

async function recoverColdStartFailure(params: ColdStartParams,
  written: Buffer | undefined, error: unknown): Promise<ColdStartOutcome> {
  const rollback = written === undefined ? "" : await rollbackMarker(params.worktreePath, written);
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, reason: `${message}${rollback}` };
}
async function rollbackMarker(cwd: string, written: Buffer): Promise<string> {
  try {
    const removed = await removeWorktreeMarkerGeneration(cwd, written);
    return removed.kind === "removed" ? "" : ` The checkout's marker changed; inspect ${cwd} before retrying.`;
  } catch (error) { return ` Marker rollback failed at ${cwd}: ${error instanceof Error ? error.message : String(error)}. Inspect its marker before retrying.`; }
}
