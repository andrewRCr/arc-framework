/** Repository-qualified branch ownership for session cleanup; no branch-name inference. */
import { describeRecordConflicts } from "../store/conflict-diagnostics.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { BranchLink } from "../store/links.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { workBranchName } from "../store/lifecycle-branch.js";

/** Selected storage and optional invocation-bound project identity. */
export interface StoreBranchOptions { store?: Store; projectId?: () => Promise<string> }
/** Exact branch authority, or the evidence preventing a cleanup decision. */
export type StoreBranchResolution = { status: "ready"; record: StoreRecord; link: BranchLink }
  | { status: "unavailable"; reason: string };
/** Resolve a branch through its qualified reverse link, preserving failed lookup/read evidence. */
export async function resolveStoreBranch(store: Store, branch: string, projectId?: () => Promise<string>): Promise<StoreBranchResolution> {
  const project = await resolveProjectIdentity(projectId ?? createProjectIdentityReader(store));
  if (project.status !== "ready") return { status: "unavailable", reason: `${project.reason} ${project.remedy.text}` };
  const lookup = await store.lookup({ kind: "ref", repository: project.id, ref: branch });
  if (lookup.status === "refused") return { status: "unavailable", reason: `${lookup.refusal.condition} ${lookup.refusal.remedy.text}` };
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") return { status: "unavailable", reason: `${read.refusal.condition} ${read.refusal.remedy.text}` };
  const record = read.result;
  const links = record.links?.branches?.filter(link => link.repository === project.id && workBranchName(link.ref) === workBranchName(branch)) ?? [];
  if (record.conflicts.length > 0 || links.length !== 1 || links[0] === undefined) return { status: "unavailable", reason: `Branch ${branch} has conflicting or ambiguous linked state; repair its record and branch links, then retry.${describeRecordConflicts(record.conflicts)}` };
  return { status: "ready", record, link: links[0] };
}
