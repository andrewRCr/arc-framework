/** Current work-unit identity consumed by release and delivery entry points. */
import { resolveCurrentWorkUnit } from "../store/current-work-unit.js";
import { createStore } from "../store/create.js";
import { createDefaultStorePorts } from "../store/default-store-ports.js";
import type { Store } from "../store/contract.js";
import { createProjectIdentityReader } from "../store/project-identity.js";
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import type { CurrentWorkUnitCandidate } from "../store/current-work-unit.js";
import { workItemArtifactPath } from "../store/lifecycle-storage.js";
import { StoreRefusalError } from "../store/refusal-error.js";
import { isNativeTypedRefusal, type NativeTypedRefusal } from "../store/native-refusal.js";

const MULTI_CANDIDATE_HINT = "Multiple status files resolved under the active root. Run session-init disambiguation to choose.";
export interface ResolveActiveWuOptions {
  cwd: string;
  store?: Store;
  projectId?: () => Promise<string>;
  rootSegments?: readonly string[];
}
/** The current work unit's projected active path and repository-qualified work branch. */
export interface ResolvedWu { path: string; name: string; branch: string | null }
export type WuResolution =
  | ({ status: "resolved" } & ResolvedWu)
  | { status: "none" }
  /** `cause` is the native typed refusal behind an off-branch read's failure, for callers that report it whole. */
  | { status: "ambiguous"; hint: string; cause?: NativeTypedRefusal };

/** Resolve the checkout's current work unit through the operational storage contract. */
export async function resolveActiveWu(opts: ResolveActiveWuOptions): Promise<WuResolution> {
  const store = opts.store ?? createStore(createDefaultStorePorts({ checkoutRoot: opts.cwd }));
  const resolved = await resolveCurrentWorkUnit({ cwd: opts.cwd, store });
  if (resolved.status === "ambiguous") return { status: "ambiguous", hint: MULTI_CANDIDATE_HINT };
  if (resolved.status === "none") return resolved.warnings.length === 0 ? { status: "none" }
    : { status: "ambiguous", hint: resolved.warnings.join("; ") };
  const candidate = resolved.candidate;
  let branch = candidate.record?.branch ?? null;
  if (store.capabilities.stateOffBranch) {
    try { branch = await resolveBranch(store, candidate, opts.projectId); }
    catch (error) {
      return { status: "ambiguous", hint: error instanceof Error ? error.message : String(error),
        ...(isNativeTypedRefusal(error) ? { cause: error } : {}) };
    }
  }
  return { status: "resolved", name: candidate.reference.owner.name, branch,
    path: workItemArtifactPath(candidate.reference.owner.name, "meta", { kind: "active" }, candidate.record?.cohort ?? null) };
}
/** Raise the native typed refusal behind an ambiguous resolution, for a caller that reports it whole. */
export function raiseNativeResolutionRefusal(resolution: WuResolution): WuResolution {
  if (resolution.status === "ambiguous" && resolution.cause !== undefined) throw resolution.cause;
  return resolution;
}

/** Resolve the current work unit's projected active meta path for self-exclusion. */
export async function resolveOriginatingMetaPath(cwd: string, store?: Store, projectId?: () => Promise<string>): Promise<string | undefined> {
  const activeWu = await resolveActiveWu({ cwd, store, projectId });
  return activeWu.status === "resolved" ? activeWu.path : undefined;
}

async function resolveBranch(store: Store, candidate: CurrentWorkUnitCandidate, projectId?: () => Promise<string>): Promise<string | null> {
  const repository = await (projectId ?? createProjectIdentityReader(store))();
  if (repository.trim() === "") throw new Error("Project identity is unavailable.");
  const read = await store.read({ reference: candidate.reference });
  if (read.status === "refused") throw new StoreRefusalError(read.refusal, true);
  if (read.result.conflicts.length > 0) throw new Error(
    `The work-unit primary has unresolved conflicts: ${read.result.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry work-unit resolution.`);
  const selected = selectWorkBranchLink(read.result, { repository });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  return selected.kind === "linked" ? workBranchName(selected.link.ref) : null;
}
