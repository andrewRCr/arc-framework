/** Publication boundary transport and review progress shared by lifecycle publication paths. */
import type { GitExec } from "../lib/git/exec.js";
import { canonicalize, type CanonicalDigest } from "../lib/kernel/index.js";
import type { PublishParams } from "../lib/work-unit/verbs/publish.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../lib/store/kinds/review/integration-boundary/access.js";
import type { ReviewReadinessBinding } from "../lib/store/kinds/review/integration-boundary/readiness.js";
import type { PublishedIntegrationBoundaryLocus } from "../scripts/review-gate/policy/integration-boundary-locus.js";
import type { ReviewInvocationContext } from "../scripts/review-gate/runtime/invocation.js";
import { createReviewCompositionContext } from "../scripts/review-gate/runtime/composition-context.js";
import { resolveRepositoryIdentity } from "../scripts/review-gate/hosts/local/git-common-state.js";
import { readLaneProgressOwnerVersioned } from "../scripts/review-gate/lane-progress.js";
import { readReviewReadinessBinding } from "../scripts/review-gate/runtime/readiness-binding.js";
import { prepareNativePublicationClaim } from "../lib/store/kinds/review/integration-boundary/publication.js";
import { unwrapReviewRecordResult } from "../lib/store/kinds/review/access-shared.js";
import type { IntegrationBoundaryLocusV2 } from "../scripts/review-gate/policy/integration-boundary-locus-v2.js";

interface PublicationReviewInput {
  cwd: string;
  exec: GitExec;
  invocation: ReviewInvocationContext;
  candidateId: CanonicalDigest;
}

interface PublicationReviewContext {
  repositoryId: string;
  currentHead: () => Promise<string>;
  readReadinessBinding: () => Promise<ReviewReadinessBinding>;
  readStandardLaneOwnerVersion: () => Promise<number>;
}

/** Bind publication's progress observation to its originating operational authority. */
export async function openPublicationReviewContext(input: PublicationReviewInput): Promise<PublicationReviewContext> {
  const { publisher, family } = createReviewCompositionContext({ ...input.invocation, cwd: input.cwd, exec: input.exec });
  const repositoryId = await resolveRepositoryIdentity(publisher, undefined, input.invocation);
  const currentHead = async () => (await input.exec("git", ["rev-parse", "HEAD"], { cwd: input.cwd })).stdout.trim();
  return { repositoryId, currentHead,
    readReadinessBinding: async (): Promise<ReviewReadinessBinding> => input.invocation.workItem === undefined
      ? { status: "incomplete", condition: "Publication has no selected work-item owner. Re-enter through the named work unit." }
      : readReviewReadinessBinding({ store: input.invocation.store, workItem: input.invocation.workItem,
        inFlight: family.ports.inFlight, repositoryId, candidateId: input.candidateId, headSha: await currentHead() }),
    readStandardLaneOwnerVersion: async () => (await readLaneProgressOwnerVersioned(family.ports.inFlight, {
      lane: "standard", repositoryId, headSha: await currentHead(), lineage: { kind: "candidate", candidateId: input.candidateId },
    })).version };
}

interface PublicationBoundaryInput {
  cwd: string;
  exec: GitExec;
  invocation: ReviewInvocationContext;
  snapshot: Awaited<ReturnType<typeof readSubmissionBoundaryVersioned>> & { boundary: PublishedIntegrationBoundaryLocus };
  readStandardLaneOwnerVersion: () => Promise<number>;
  readReadinessBinding?: () => Promise<ReviewReadinessBinding>;
}

interface PublicationBoundaryAccess {
  ports: Pick<PublishParams, "claimPublicationBoundary" | "preparePublicationClaim">;
  persistUnchanged(next: PublishedIntegrationBoundaryLocus): Promise<void>;
}

/** Keep publication claims and continuations on the selected version-bound transport. */
export function createPublicationBoundaryAccess(input: PublicationBoundaryInput): PublicationBoundaryAccess {
  const { boundary, version } = input.snapshot;
  const prepareNative = async (next: IntegrationBoundaryLocusV2) => {
    if (input.invocation.workItem === undefined || input.readReadinessBinding === undefined) {
      throw new Error("Publication requires its selected work-item owner and live readiness reader. Re-enter through the named work unit.");
    }
    return prepareNativePublicationClaim({ store: input.invocation.store, cwd: input.cwd, owner: input.invocation.workItem,
      boundary: next, expectedVersion: version, readReadinessBinding: input.readReadinessBinding });
  };
  const persist = async (next: PublishedIntegrationBoundaryLocus) => {
    if (input.invocation.store.capabilities.stateOffBranch) {
      if (next.schemaVersion !== 2) throw new Error("Native publication requires a version-two boundary.");
      const mutation = await prepareNative(next);
      unwrapReviewRecordResult(await input.invocation.store.write({ ...mutation,
        provenance: { verb: "publish", lifecycleAction: "publish" } }));
      return;
    }
    const path = await writeSubmissionBoundary(input.cwd, next, version,
      { store: input.invocation.store, owner: input.invocation.workItem });
    await input.exec("git", ["add", "--", path], { cwd: input.cwd });
  };
  const ports: Pick<PublishParams, "claimPublicationBoundary" | "preparePublicationClaim"> = {
    ...(input.invocation.store.capabilities.stateOffBranch ? { preparePublicationClaim: prepareNative } : {}),
    claimPublicationBoundary: async next => {
      if (boundary.schemaVersion === 1 && (boundary.locus === "candidate-publish-ready" || boundary.locus === "publication-pending")
        && boundary.standardLaneOwnerVersion !== await input.readStandardLaneOwnerVersion()) {
        throw new Error("standard review progress changed after publication readiness was recorded");
      }
      await persist(next);
    },
  };
  return { ports, persistUnchanged: async (next: PublishedIntegrationBoundaryLocus) => {
    if (canonicalize(next) !== canonicalize(boundary)) await persist(next);
  } };
}
