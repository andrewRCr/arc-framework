/** Validate the semantic address of an indexed capsule without rebinding its exact owner generation. */
import { identifyArcFileAddress, identifyWorkUnitArtifactPath } from "../../layout/index.js";
import { sameOwner, type RecordReference } from "../identity.js";
import { classifyStoreAddress, type ClassifiedStoreTarget } from "../target-classification.js";
import type { ProjectionAdmission } from "../projection-admission.js";
import { projectionCandidateContainers } from "./container-ownership.js";

/** Require a projected kind/key while permitting stale public-name hints on exact indexed UIDs. */
export function matchesIndexedProjectionAddress(local: ProjectionAdmission["local"], reference: RecordReference): boolean {
  const direct = identifyArcFileAddress(local.path, { active: { claim: local.claim, layoutActive: local.layoutActive } });
  const artifact = identifyWorkUnitArtifactPath(local.path, { claim: local.claim, layoutActive: local.layoutActive });
  const hinted = reference.owner.type === "work-item" ? identifyArcFileAddress(local.path,
    { active: { claim: reference.owner.name, layoutActive: local.layoutActive } }) : null;
  const addresses = [direct, hinted, artifact === null ? null : { kind: "work-unit-artifact" as const, ...artifact }];
  if (addresses.some(address => address !== null && matchesTarget(classifyStoreAddress(address), reference))) return true;
  const candidates = projectionCandidateContainers(local.path);
  const indexed = candidates.filter(container => local.indexedMetadata.some(item =>
    item.reference.kind === "work-item/meta" && sameOwner(item.reference.owner, reference.owner)
    && identifyArcFileAddress(item.path, { workItem: container })?.kind === "work-unit-artifact"));
  return (indexed.length === 0 ? candidates : indexed).some(container => {
    const address = identifyArcFileAddress(local.path, { workItem: container });
    return address !== null && matchesTarget(classifyStoreAddress(address), reference);
  });
}

function matchesTarget(target: ClassifiedStoreTarget | null, reference: RecordReference): boolean {
  return target !== null && target.kind === reference.kind && (target.key ?? null) === (reference.key ?? null)
    && (target.identity === undefined || reference.owner.type === "person" && target.identity === reference.owner.name);
}
