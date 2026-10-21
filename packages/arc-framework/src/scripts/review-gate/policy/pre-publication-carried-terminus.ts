/** Bind retained native terminus references before evidence binding and pure policy evaluation. */
import type { PublishedIntegrationBoundaryLocus } from "./integration-boundary-locus.js";
import { nativeBoundaryTerminusReference } from "../runtime/native-terminus.js";
import type { PrePublicationCompositionDependencies } from "./pre-publication-request.js";

/** Resolve the original decision through the boundary's current Candidate subject. */
export function bindPrePublicationCarriedTerminus(
  dependencies: PrePublicationCompositionDependencies,
  boundary: PublishedIntegrationBoundaryLocus | null,
): PrePublicationCompositionDependencies {
  if (boundary?.schemaVersion !== 2 || boundary.terminus === null) return dependencies;
  const resolve = dependencies.resolveNativeTerminus?.bind(dependencies);
  if (dependencies.stateOffBranch !== true || resolve === undefined) {
    throw new Error("Restore the selected native review backend before resolving its retained terminus, then retry.");
  }
  return { ...dependencies, resolveNativeTerminus: context => resolve({ ...context,
    ...nativeBoundaryTerminusReference(boundary, context.subject) }) };
}
