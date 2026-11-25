/** Durable landing traceability with a retryable result after the host has already merged. */
import { z } from "zod";
import type { Store } from "../../lib/store/contract.js";
import { OwnerIdentitySchema, type OwnerIdentity } from "../../lib/store/identity.js";
import { recordConflictRefusal } from "../../lib/store/conflict-diagnostics.js";
import { mergeLifecycleLinks, readWorkUnit, recordPut } from "../../lib/store/lifecycle-write.js";
import type { IntegrationCheckpointCompositionRecord } from "./checkpoint-store.js";
import { SpineRemedySchema, spineRemedy } from "./spine-refusal.js";
import { nativeRefusalText } from "../../lib/store/native-refusal.js";
import { StoreRefusalError } from "../../lib/store/refusal-error.js";

/** Native landing-link persistence is distinct from the host's completed merge. */
export const LandingLinkStateSchema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("written") }),
  z.strictObject({ state: z.literal("not-written"), detail: z.string().min(1).max(4_096), remedy: SpineRemedySchema }),
]);
/** Reported landing-link persistence outcome. */
type LandingLinkState = z.infer<typeof LandingLinkStateSchema>;

/** Resolve only the project and work-item generation retained by a native checkpoint. */
export async function nativeCheckpointOwner(checkpoint: IntegrationCheckpointCompositionRecord,
  projectId: () => Promise<string>): Promise<OwnerIdentity> {
  const binding = checkpoint.nativeOwnership;
  if (binding === undefined) throw new Error("The native checkpoint has no ownership binding. Recompose its checkpoint before retrying.");
  if (await projectId() !== binding.projectId) throw new Error("The checkpoint project differs from this store. Restore its project identity, then retry.");
  return OwnerIdentitySchema.parse({ type: "work-item", name: checkpoint.workUnit, uid: binding.workItemUid });
}

/** Add the host's merge commit to the current work item using its exact observed record version. */
export async function writeWorkUnitLandingCommit(input: {
  store: Store; projectId(): Promise<string>; workUnit: string; owner?: OwnerIdentity; sha: string;
}): Promise<void> {
  const selected = await readWorkUnit(input.store, input.workUnit, input.owner);
  if (selected.status === "refused") throw new StoreRefusalError(selected.refusal, input.store.capabilities.stateOffBranch);
  if (selected.result.conflicts.length > 0) {
    const refusal = recordConflictRefusal(selected.result, `Metadata for \`${input.workUnit}\``, "lifecycle.meta-conflict");
    throw new StoreRefusalError(refusal, input.store.capabilities.stateOffBranch);
  }
  const record = selected.result, repository = await input.projectId();
  const prior = record.links?.landingCommit;
  if (prior?.repository === repository && prior.sha === input.sha && prior.copyKey === undefined) return;
  const links = mergeLifecycleLinks(record.links, { landingCommit: { repository, sha: input.sha } });
  const written = await input.store.write({ ...recordPut(record, { links }),
    provenance: { verb: "integrate-merge", lifecycleAction: "landing-link" } });
  if (written.status === "refused") throw new StoreRefusalError(written.refusal, input.store.capabilities.stateOffBranch);
}

/** Keep a landed merge successful when its link needs the same merge invocation retried. */
export async function recordLandingLink(input: {
  workUnit: string; checkpointHandle: string; providerMergeId: string | null;
  write?: (workUnit: string, sha: string) => Promise<void>;
  /** Why exact merged-state confirmation named no merge commit, when it failed rather than reporting none. */
  confirmationDetail?: string;
}): Promise<LandingLinkState | undefined> {
  if (input.write === undefined) return undefined;
  let detail = input.confirmationDetail ?? "The host has not reported the merge commit.";
  if (input.providerMergeId !== null) {
    try {
      await input.write(input.workUnit, input.providerMergeId);
      return { state: "written" };
    } catch (error) {
      detail = (nativeRefusalText(error) ?? (error instanceof Error ? error.message : String(error))).replace(/\s+/gu, " ").trim().slice(0, 4_096)
        || "Landing-link persistence failed.";
    }
  }
  return { state: "not-written", detail, remedy: spineRemedy(
    "The merge landed, but its landing-commit link is not recorded.",
    "Repair the reported condition and rerun the approved merge to record the link",
    ["arc", "integrate", "merge", input.workUnit, "--checkpoint", input.checkpointHandle],
  ) };
}
