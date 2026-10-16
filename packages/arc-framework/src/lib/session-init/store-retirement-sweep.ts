/** Store lineage selects abandoned checkouts independently of committed Git receipts. */
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { SlugSchema } from "../kernel/index.js";
import { readWorkUnit } from "../store/lifecycle-write.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { workBranchName } from "../store/lifecycle-branch.js";
import { readStoreRetirementEvidence } from "../work-unit/store-retirement-evidence.js";
import { checkWorktreeRemoval } from "../git/worktree-removal.js";
import { projectSuccessorReadiness } from "../work-unit/retirement-lifecycle-result.js";
import { projectCleanupRemoteEvidence } from "./cleanup-remote-evidence.js";
import type { RunLandedRetirementSweepOptions, LandedRetirementResidue, LandedRetirementSweepResult } from "./lifecycle-residue-sweep.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { Store } from "../store/contract.js";
type StoreSweepOptions = RunLandedRetirementSweepOptions & { store: Store };
type BranchedCheckout = RegisteredWorktree & { branch: string };
/** Preserve the remote physical-removal gate while taking terminal authority from the selected lineage. */
export async function runStoreRetirementSweep(options: StoreSweepOptions): Promise<LandedRetirementSweepResult> {
  const remote = projectCleanupRemoteEvidence(options.baseBranch, options.baseEvidence);
  const retirements: LandedRetirementResidue[] = [];
  for (const checkout of options.topology) {
    const name = candidateName(options, checkout);
    if (name === null || checkout.branch === null) continue;
    const branched = { ...checkout, branch: checkout.branch };
    try {
      const residue = await inspectAbandonment(options, branched, name, remote.remoteEvidence === "exact");
      if (residue !== null) retirements.push(residue);
    } catch (error) { const repair = error instanceof Error ? error.message : String(error); retirements.push({ ...blocked(branched, name, "repair-required"), repair }); }
  }
  return { ...remote, retirements, warnings: [] };
}
function candidateName(options: StoreSweepOptions, checkout: RegisteredWorktree): string | null {
  const marker = options.markers.get(checkout.path);
  if (checkout.branch === null || checkout.detached || marker?.kind !== "present" || !marker.marker.spawnedByArc
    || marker.marker.createdFor?.kind !== "work-unit" || marker.marker.wuName !== marker.marker.createdFor.name
    || marker.marker.husk !== undefined || marker.marker.renameMovePending !== undefined) return null;
  return marker.marker.createdFor.name;
}
async function inspectAbandonment(options: StoreSweepOptions, checkout: BranchedCheckout, name: string, exact: boolean): Promise<LandedRetirementResidue | null> {
  if (!await hasAbandonment(options.store, name)) return null;
  const evidence = await readStoreRetirementEvidence(options.store, name, checkout.head);
  if (evidence.rule !== "discard" || evidence.evidence.kind !== "lineage" || evidence.evidence.transition !== "abandon") return null;
  const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(options.store));
  if (project.status !== "ready") throw new Error(`${project.reason} ${project.remedy.text}`);
  if (!evidence.branches.some(link => link.repository === project.id && workBranchName(link.ref) === workBranchName(checkout.branch))) {
    throw new Error(`Terminal lineage for ${name} does not retain the repository-qualified branch ${checkout.branch}; repair its exact branch links before teardown.`);
  }
  if (!exact || !hasPhysicalEvidence(options)) return blocked(checkout, name, "evidence-unavailable");
  const removal = await (options.checkRemoval?.(checkout.path) ?? checkWorktreeRemoval({ exec: options.exec, checkoutPath: checkout.path,
    disposition: "remove", check: options.projectionRemovalSlots?.check }));
  if (removal.kind === "missing") return null;
  if (removal.kind === "refused") return blocked(checkout, name, removal.reason === "dirty" || removal.reason === "persist-would-refuse" ? "uncommitted" : removal.reason);
  return actionable(checkout, name);
}
function hasPhysicalEvidence(options: StoreSweepOptions): boolean {
  const supplied = options.baseEvidence;
  return supplied?.history.kind === "complete" && supplied.snapshot.kind === "available" && supplied.snapshot.tips[options.baseBranch] !== undefined;
}
function actionable(checkout: BranchedCheckout, name: string): LandedRetirementResidue {
  const pending = { status: "pending" } as const;
  return { status: "actionable", worktreePath: checkout.path, lifecycle: { subject: { slug: name, branch: checkout.branch }, transition: "abandon",
    cleanup: { branch: pending, worktree: pending, userWorkspace: pending }, successorReadiness: projectSuccessorReadiness([], true) },
    teardown: { argv: ["arc", "teardown", name], text: `arc teardown ${name}` }, actions: [{ argv: ["arc", "teardown", name], text: `arc teardown ${name}` }] };
}
async function hasAbandonment(store: Store, name: string): Promise<boolean> {
  const primary = await readWorkUnit(store, name);
  if (primary.status === "ok") return false;
  if (primary.refusal.code !== "not-found") throw new Error(`${primary.refusal.condition} ${primary.refusal.remedy.text}`);
  const found = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) });
  if (found.status === "refused") {
    if (found.refusal.code === "not-found") return false;
    throw new Error(`${found.refusal.condition} ${found.refusal.remedy.text}`);
  }
  const read = await store.read({ reference: found.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  return LineageRecordSchema.parse(read.result.fields).kind === "abandon";
}
function blocked(checkout: BranchedCheckout, name: string, reason: string): Extract<LandedRetirementResidue, { status: "blocked" }> {
  return { status: "blocked", worktreePath: checkout.path, subject: { slug: name, branch: checkout.branch }, reason };
}
