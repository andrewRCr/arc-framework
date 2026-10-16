/** Release machine-local work-unit occupancy without changing its operational lifecycle. */
import { dirname, resolve } from "node:path";
import { MetaPauseSchema, ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { localPathContains } from "../local-path-identity.js";
import { WorkUnitStateSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { GitExec } from "../git/exec.js";
import { GitProcessError } from "../git/process-error.js";
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../git/worktree-roster.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarkerGeneration, removeWorktreeMarkerGeneration } from "../git/worktree-marker.js";
import { releaseWorktreeCheckout, removeWorktreeCheckout, describeRemovalRefusal, type ProjectionRemovalSlots } from "../git/worktree-removal.js";
import type { LocusPorts } from "../work-unit/locus-ports.js";
import { createLocusPorts } from "./lifecycle-ports.js";
import { inspectCheckoutMarker, type PresentMarker } from "./marker-occupancy.js";
export interface LocusReleaseContext {
  cwd: string; exec: GitExec; store: Store; identity: string; baseBranch: string;
  locusPorts?: LocusPorts; projectionRemovalSlots?: ProjectionRemovalSlots; chdir?: (path: string) => void;
}
export type LocusReleaseResult = { status: "released"; checkoutPath: string; spawned: boolean; nextCheckoutPath?: string }
  | { status: "refused"; reason: string };
/** Release the named holding checkout, or the entering checkout when unnamed. */
export async function runLocusRelease(ctx: LocusReleaseContext, slug?: string): Promise<LocusReleaseResult> {
  if (!ctx.store.capabilities.stateOffBranch) return { status: "refused", reason: "Locus release is unsupported until state lives off the branch; use arc park and arc teardown." };
  const exec: GitExec = (command, args, options) => ctx.exec(command, args, { cwd: ctx.cwd, ...options });
  try {
    const ports = ctx.locusPorts ?? createLocusPorts({ cwd: ctx.cwd, exec, store: ctx.store });
    const target = slug === undefined ? ctx.cwd : await ports.findHoldingCheckout({ name: slug, resolveLegacy: () => Promise.resolve(null) });
    if (target === null) return refused(`No checkout here holds '${slug}'. Run arc locus --json to inspect this machine's checkouts.`);
    const occupancy = await inspectCheckoutMarker({ cwd: target, store: ctx.store, identity: ctx.identity });
    if (occupancy.kind === "clear") return refused(`Checkout ${target} has no work-unit marker to release. Run arc locus --json to inspect this machine's checkouts.`);
    if (occupancy.kind === "unreadable") return refused(occupancy.reason);
    const authority = releaseAuthority(ctx.identity, occupancy);
    if (authority !== null) return refused(authority);
    const topology = await scanRegisteredWorktrees(exec);
    if (!topology.ok) return refused(`${topology.message}. Run again once Git lists the worktrees.`);
    const checkout = topology.worktrees.find(entry => resolve(entry.path) === resolve(target));
    const primary = topology.worktrees.find(entry => entry.primary);
    if (checkout === undefined || primary === undefined) return refused("The target or primary checkout is absent from the registered-worktree listing. Run again once Git lists the worktrees.");
    const spawned = occupancy.marker.marker.spawnedByArc;
    if (spawned && checkout.primary) return refused("A spawned marker cannot authorize removal of the primary checkout. Inspect and repair its marker first.");
    if (spawned) await requirePreservedDetachedHead(exec, checkout, ctx.baseBranch);
    await revalidateMarker(target, occupancy.marker);
    const nextCheckoutPath = await leaveReleasedCheckout(ctx, target, primary.path);
    await releaseCheckout({ ...ctx, exec }, target, primary.path, spawned, occupancy.marker);
    return { status: "released", checkoutPath: target, spawned, ...(nextCheckoutPath === undefined ? {} : { nextCheckoutPath }) };
  } catch (error) { return refused(error instanceof Error ? error.message : String(error)); }
}
function releaseAuthority(identity: string, occupancy: Extract<Awaited<ReturnType<typeof inspectCheckoutMarker>>, { kind: "occupied" }>): string | null {
  const ownership = decodeWorktreeMarkerOwnership(occupancy.marker.marker);
  if (ownership.kind !== "current" || ownership.subject.kind !== "work-unit" || occupancy.marker.marker.husk !== undefined) return occupancy.reason;
  if (occupancy.missingRecord) return null;
  if (occupancy.workUnit === null) return occupancy.reason;
  if (occupancy.workUnit.conflicts.length > 0) return "The work-unit record has unresolved conflicts. Resolve them before releasing its checkout.";
  const fields = ParsedMetaRecordSchema.parse(occupancy.workUnit.fields);
  WorkUnitStateSchema.parse(fields.state);
  if (fields.owner === null) return "The work-unit owner is unavailable. Repair the owner before releasing its checkout.";
  if (fields.owner !== identity || occupancy.workUnit.placement?.kind === "backlog") return null;
  if (occupancy.workUnit.placement?.kind === "completed" || fields.state === "Shipped") return `The work unit has ended; run arc teardown ${occupancy.workUnit.reference.owner.name}.`;
  if (fields.pause !== null) { MetaPauseSchema.parse(fields.pause); return null; }
  return occupancy.reason;
}
async function revalidateMarker(checkout: string, expected: PresentMarker): Promise<void> {
  const current = await readWorktreeMarkerGeneration(checkout);
  if (current.kind !== "present" || !current.bytes.equals(expected.bytes)) throw new Error(`Checkout ${checkout}'s marker generation changed; inspect arc locus --json, then rerun release against its current marker.`);
}
async function leaveReleasedCheckout(ctx: LocusReleaseContext, target: string, primary: string): Promise<string | undefined> {
  if (!(await localPathContains(target, ctx.cwd))) return undefined;
  const destination = resolve(target) === resolve(primary) ? dirname(resolve(primary)) : primary;
  (ctx.chdir ?? process.chdir)(destination);
  return destination;
}
async function releaseCheckout(ctx: LocusReleaseContext, target: string, primary: string, spawned: boolean, expected: PresentMarker): Promise<void> {
  const options = { exec: ctx.exec, checkoutPath: target, primaryWorktreePath: primary, slots: ctx.projectionRemovalSlots };
  if (spawned) {
    const result = await removeWorktreeCheckout(options);
    if (result.kind === "refused") throw new Error(describeRemovalRefusal(result.check));
    if (result.kind === "failed") throw new Error(`Checkout removal failed at ${result.step}: ${result.detail}`);
    return;
  }
  const result = await releaseWorktreeCheckout(options);
  if (result.kind === "refused") throw new Error(describeRemovalRefusal(result.check));
  const removed = await removeWorktreeMarkerGeneration(target, expected.bytes);
  if (removed.kind !== "removed") throw new Error(`Checkout ${target}'s marker generation changed during release; inspect it, then retry.`);
}
async function requirePreservedDetachedHead(exec: GitExec, checkout: RegisteredWorktree, baseBranch: string): Promise<void> {
  if (!checkout.detached) return;
  const bases: string[] = [];
  for (const ref of [`refs/heads/${baseBranch}`, `refs/remotes/origin/${baseBranch}`]) {
    try {
      const result = await exec("git", ["--no-replace-objects", "rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: checkout.path, objectAccess: "local-only" });
      const oid = result.stdout.trim();
      if (oid !== "") bases.push(oid);
    } catch (error) { if (!(error instanceof GitProcessError && error.exitCode === 1)) throw error; }
  }
  if (bases.length === 0) throw new Error(`No base ref resolves for ${baseBranch}; preserve detached HEAD with git switch -c <name>, then retry release.`);
  const result = await exec("git", ["--no-replace-objects", "rev-list", checkout.head, "--not", ...bases], { cwd: checkout.path, objectAccess: "local-only" });
  const commits = result.stdout.trim().split(/\s+/u).filter(Boolean);
  if (commits.length > 0) throw new Error(`Detached HEAD holds commits not on base: ${commits.join(", ")}; preserve them with git switch -c <name>, then retry arc locus release.`);
}
function refused(reason: string): Extract<LocusReleaseResult, { status: "refused" }> { return { status: "refused", reason }; }
