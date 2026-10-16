/** Missing-folder repairs use the linked work item's placement and branch authority. */
import type { Store } from "../store/contract.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { workBranchName } from "../store/lifecycle-branch.js";
import { missingRegistrationActions } from "./missing-worktree-folders.js";
import type { SessionAction } from "./actions.js";
/** Resolve a branch registration without inferring work ownership from branch spelling. */
export async function readStoreMissingFolderActions(input: { store: Store; projectId?: () => Promise<string>; warnings?: string[] },
  checkout: { path: string; branch: string | null }, locked: boolean): Promise<SessionAction[] | null> {
  const plain = () => missingRegistrationActions(checkout.path, { locked });
  if (checkout.branch === null) return plain();
  let project;
  try { project = await resolveProjectIdentity(input.projectId ?? createProjectIdentityReader(input.store)); }
  catch (error) { input.warnings?.push(error instanceof Error ? error.message : String(error)); return null; }
  if (project.status !== "ready") { input.warnings?.push(`${project.reason} ${project.remedy.text}`); return null; }
  const branch = workBranchName(checkout.branch);
  const found = await input.store.lookup({ kind: "ref", repository: project.id, ref: branch });
  if (found.status === "refused") {
    if (found.refusal.code === "not-found") return plain();
    input.warnings?.push(`${found.refusal.condition} ${found.refusal.remedy.text}`); return null;
  }
  const read = await input.store.read({ reference: found.result.reference });
  if (read.status === "refused") {
    if (read.refusal.code === "not-found") return plain();
    input.warnings?.push(`${read.refusal.condition} ${read.refusal.remedy.text}`); return null;
  }
  if (read.result.placement?.kind !== "completed") return plain();
  const link = read.result.links?.branches?.find((item) => item.repository === project.id && workBranchName(item.ref) === branch);
  if (link === undefined) { input.warnings?.push(`Work item ${read.result.reference.owner.name} lacks its linked branch ${branch}; repair that link, then retry.`); return null; }
  return link.linkedAs === "created" ? missingRegistrationActions(checkout.path, { locked, workUnitName: read.result.reference.owner.name }) : plain();
}
