/** Project identity comes from the selected store's unique project owner, independently of code remotes. */
import type { Store } from "./contract.js";
import type { Remedy, StoreRefusal } from "./refusal.js";

/** Actionable failure to resolve the selected project's stable identity. */
export interface ProjectIdentityUnavailable {
  status: "unavailable";
  reason: string;
  remedy: Remedy;
  refusal?: StoreRefusal;
}
/** Expected identity-read failure carried through a callback that returns a project ID. */
export class ProjectIdentityError extends Error {
  constructor(readonly failure: ProjectIdentityUnavailable) {
    super(`${failure.reason} ${failure.remedy.text}`);
    this.name = "ProjectIdentityError";
  }
}

/** Bind one lazy identity observation to the selected invocation and store.
 * @param store - Selected operational backend.
 * @returns A callback retaining its exact observation across checkout rebinding.
 */
export function createProjectIdentityReader(store: Store): () => Promise<string> {
  let observation: Promise<string> | undefined;
  return () => observation ??= readProjectIdentity(store);
}

/** Resolve a bound project ID while retaining expected store diagnostics for verb results.
 * @param reader - Invocation-bound project identity callback, when available.
 * @returns Stable identity or actionable expected refusal; unexpected defects still throw.
 */
export async function resolveProjectIdentity(reader?: () => Promise<string>): Promise<{ status: "ready"; id: string } | ProjectIdentityUnavailable> {
  if (reader === undefined) return unavailable("Project identity is unavailable.");
  try { return { status: "ready", id: await reader() }; }
  catch (error) { if (error instanceof ProjectIdentityError) return error.failure; throw error; }
}

async function readProjectIdentity(store: Store): Promise<string> {
  const listing = await store.list({ family: "project-registry", kind: "project-registry/identity" });
  if (listing.status === "refused") throw new ProjectIdentityError({ status: "unavailable", reason: listing.refusal.condition,
    remedy: listing.refusal.remedy, refusal: listing.refusal });
  const result = listing.result;
  if (result.status === "unreadable") throw new ProjectIdentityError({ status: "unavailable", reason: result.condition, remedy: result.remedy });
  if (result.status === "absent") throw new ProjectIdentityError(unavailable("Project identity record is missing."));
  if (result.missed || result.diagnostics.length > 0) throw new ProjectIdentityError(unavailable(
    `Project identity inventory is incomplete: ${result.diagnostics.map((item) => item.condition).join("; ") || "records were missed"}.`));
  if (result.records.length !== 1) throw new ProjectIdentityError(unavailable(result.records.length === 0
    ? "Project identity record is missing." : "Project identity records are ambiguous."));
  const record = result.records[0];
  if (record === undefined || record.reference.kind !== "project-registry/identity" || record.reference.owner.type !== "project"
    || record.reference.owner.uid === undefined || record.conflicts.length > 0) {
    throw new ProjectIdentityError(unavailable("Project identity record has no unambiguous project UID."));
  }
  return record.reference.owner.uid;
}
function unavailable(reason: string): ProjectIdentityUnavailable {
  return { status: "unavailable", reason, remedy: { text: "Restore the project's unique, valid identity record from its authoritative state source, then retry." } };
}
