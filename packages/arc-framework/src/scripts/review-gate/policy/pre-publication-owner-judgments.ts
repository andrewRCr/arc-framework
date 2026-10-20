/** Bind Owner authorization and native extra-pass judgments to the selected pre-publication invocation. */
import { SlugSchema } from "../../../lib/kernel/index.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import type { ReviewInFlightPort } from "../core/ports.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import type { ReviewInvocationInput } from "../runtime/invocation.js";
import { resolveNativeInvocationExtraPassJudgment } from "../runtime/native-extra-pass.js";
import type { PrePublicationCompositionDependencies } from "./pre-publication-request.js";

/** Preserve Owner-only terminus authorization while recording ordinary judgments under the active identity. */
export function createPrePublicationOwnerJudgments(input: ReviewInvocationInput, store: ReviewInFlightPort):
  Pick<PrePublicationCompositionDependencies, "readOwnerTerminusAuthority" | "resolveExtraPassJudgment"> {
  return { readOwnerTerminusAuthority: async workUnit => {
    const name = SlugSchema.parse(workUnit);
    let live: Awaited<ReturnType<typeof readLocalReviewLiveContext>>;
    try { live = await readLocalReviewLiveContext(input); }
    catch (error) {
      if (error instanceof ProjectIdentityError) throw error;
      return { status: "refused", reason: `The Work Unit Owner could not be resolved: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (live.context.workUnit?.identity !== name) {
      return { status: "refused", reason: "The current checkout does not resolve the requested work unit." };
    }
    if (live.context.activeIdentity === null) {
      return { status: "refused", reason: "No active ARC identity is configured for Owner authorization." };
    }
    if (live.context.activeIdentity !== live.context.workUnit.owner) {
      return { status: "refused", reason: "The active identity does not match the Work Unit Owner." };
    }
    return { status: "authorized", ownerIdentity: live.context.workUnit.owner };
  }, ...(input.store?.capabilities.stateOffBranch !== true ? {} : {
    resolveExtraPassJudgment: async context => {
      const facts = store.nativeFacts;
      if (facts === undefined) throw new Error("Resolve the selected native review facts before reading extra-pass judgments.");
      const result = await resolveNativeInvocationExtraPassJudgment(input, facts, { ...context,
        repositoryId: context.repositoryId ?? await facts.readProjectId() });
      return result.judgment;
    },
  }) };
}
