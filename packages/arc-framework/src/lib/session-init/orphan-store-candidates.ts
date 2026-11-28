/** Store-owned candidate selection shared by both orphan sweep entry points. */
import type { Store } from "../store/contract.js";
import { teardownOperand } from "../work-unit/store-retirement-evidence.js";
import type { TeardownCommand } from "./stale-worktree-sweep-schema.js";
import { ownerHolderRequest } from "../work-unit/locus-ports.js";
import type { StoreIdentityAcquisition } from "../errand/store-discovery.js";
import { acquireStoreClaims } from "../errand/store-discovery.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import { createProjectIdentityReader } from "../store/project-identity.js";
import { resolveStoreBranch, type StoreBranchOptions, type StoreBranchResolution } from "./store-branch-classification.js";

/** Acquisition facts used by cleanup, accepted directly from internal or public frame evidence. */
export type OrphanClaimsAcquisition = Exclude<StoreIdentityAcquisition, { kind: "complete" }>
  | Pick<Extract<StoreIdentityAcquisition, { kind: "complete" }>, "kind" | "identities" | "diagnostics" | "missed">;
/** Claims belong to the calling identity, independently of project Errands. */
export interface OrphanStoreOptions extends StoreBranchOptions {
  identity?: string;
  claims?: OrphanClaimsAcquisition;
}
export interface OrphanStoreCandidate {
  branch: string;
  teardown?: TeardownCommand;
  authority: Extract<StoreBranchResolution, { status: "ready" }>;
}
/** Resolve every branch before offering any cleanup; incomplete evidence declines the entire advisory. */
export async function readOrphanStoreCandidates(options: OrphanStoreOptions,
  branches: readonly string[], roster: readonly DerivedCheckoutRow[] = []): Promise<
    { status: "ready"; candidates: OrphanStoreCandidate[] } | { status: "unavailable"; reason: string }> {
  if (options.store === undefined) return { status: "unavailable", reason: "Selected store is unavailable; restore the state connection, then retry." };
  const claims = options.claims ?? (options.identity === undefined ? undefined : await acquireStoreClaims(options.store, options.identity));
  const claimBranches = completeClaimBranches(claims);
  if (claimBranches.status !== "ready") return claimBranches;
  const claimed = claimBranches.branches;
  const candidates: OrphanStoreCandidate[] = [];
  const projectId = options.projectId ?? createProjectIdentityReader(options.store);
  for (const branch of branches) {
    if (claimed.has(branch) || roster.some(row => row.identity?.branch === branch)) continue;
    const selected = await selectBranch(options.store, branch, projectId, roster);
    if (selected.status === "unavailable") return selected;
    if (selected.status === "candidate") candidates.push(selected.candidate);
  }
  return { status: "ready", candidates };
}

/** One unclaimed branch's place in the sweep: a cleanup candidate, left out, or the evidence declining the sweep. */
async function selectBranch(store: Store, branch: string, projectId: () => Promise<string>,
  roster: readonly DerivedCheckoutRow[]): Promise<{ status: "candidate"; candidate: OrphanStoreCandidate }
    | { status: "left-out" } | { status: "unavailable"; reason: string }> {
  const authority = await resolveStoreBranch(store, branch, projectId);
  if (authority.status === "unlinked") return { status: "left-out" };
  if (authority.status !== "ready") return authority;
  const record = authority.record;
  if (record.reference.kind !== "work-item/meta" && record.reference.kind !== "work-item/record") {
    return { status: "unavailable", reason: `Branch ${branch} resolves to ${record.reference.kind}; repair its work-item branch link, then retry.` };
  }
  if (record.reference.kind === "work-item/record" ? record.placement?.kind === "active"
    : roster.some(row => (row.kind === "work-unit" || row.kind === "retired")
      && row.subject.kind === "work-unit" && row.subject.uid === ownerHolderRequest(record).uid)) return { status: "left-out" };
  return { status: "candidate", candidate: { branch, authority, ...await candidateTeardown(store, authority) } };
}

/** An authoritatively absent acquisition is an empty inventory; a failed, missed, or diagnosed one declines the sweep. */
function completeClaimBranches(claims: OrphanClaimsAcquisition | undefined):
  { status: "ready"; branches: ReadonlySet<string> } | { status: "unavailable"; reason: string } {
  if (claims?.kind === "absent") return { status: "ready", branches: new Set() };
  if (claims?.kind === "complete" && !claims.missed && claims.diagnostics.length === 0) {
    return { status: "ready", branches: new Set(claims.identities.flatMap(identity => identity.branch === null ? [] : [identity.branch])) };
  }
  const detail = claims?.kind === "error" ? claims.message : claims?.kind === "complete" && claims.diagnostics.length > 0
    ? claims.diagnostics.map(item => `${item.condition} ${item.remedy.text}`).join("; ") : "Claims acquisition is not complete.";
  return { status: "unavailable", reason: `${detail} Restore a complete claims acquisition for this identity, then run arc status --session-init --json.` };
}

async function candidateTeardown(store: Store, authority: OrphanStoreCandidate["authority"]): Promise<{ teardown?: TeardownCommand }> {
  const { record, link } = authority;
  if (record.reference.kind !== "work-item/meta" || record.placement?.kind !== "completed" || link.linkedAs !== "created") return {};
  const operand = await teardownOperand(store, record.reference.owner);
  return { teardown: { argv: ["arc", "teardown", operand], text: `arc teardown ${operand}` } };
}
