/** Bind retained native terminus references before evidence binding and pure policy evaluation. */
import type { PublishedIntegrationBoundaryLocus } from "./integration-boundary-locus.js";
import type { PrePublicationCompositionDependencies } from "./pre-publication-request.js";

/** Apply the boundary's existing exact-Candidate carry rule while resolving its original decision. */
export function bindPrePublicationCarriedTerminus(
  dependencies: PrePublicationCompositionDependencies,
  boundary: PublishedIntegrationBoundaryLocus | null,
): PrePublicationCompositionDependencies {
  if (boundary?.schemaVersion !== 2 || boundary.terminus === null) return dependencies;
  const resolve = dependencies.resolveNativeTerminus?.bind(dependencies);
  if (dependencies.stateOffBranch !== true || resolve === undefined) {
    throw new Error("Restore the selected native review backend before resolving its retained terminus, then retry.");
  }
  const decisionKey = boundary.terminus;
  return { ...dependencies, resolveNativeTerminus: context => {
    const { subject } = context;
    const carried = subject.lineage.kind === "candidate" && boundary.candidateSubjectDigest !== null
      && subject.lineage.candidateId === boundary.candidateId && subject.subjectDigest === boundary.candidateSubjectDigest;
    return resolve({ ...context, ...(carried ? { decisionKey } : {}) });
  } };
}
