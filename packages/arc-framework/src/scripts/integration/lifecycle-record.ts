/** Current stored lifecycle authority and the exact metadata version it observed. */
import type { StoreRefusal } from "../../lib/store/refusal.js";
import type { Store } from "../../lib/store/contract.js";
import type { OwnerIdentity } from "../../lib/store/identity.js";
import { recordConflictRefusal } from "../../lib/store/conflict-diagnostics.js";
import { readLifecycleMetaFields, readWorkUnit, workUnitMetaPath } from "../../lib/store/lifecycle-write.js";
import { WorkUnitReadPlacementSchema } from "../../lib/store/placement.js";
import { WorkUnitStateSchema } from "../../lib/kernel/index.js";
import { deriveState } from "../../lib/work-unit/lifecycle-resolver.js";
import { lifecycleArtifactFacts } from "../review-gate/readiness.js";
import { IntegrationLifecycleSummarySchema, type IntegrationLifecycleSummary } from "./checkpoint.js";

/** Read current metadata directly, keeping its record version separate from the whole snapshot version. */
export async function readStoredLifecycleSummary(input: {
  store: Store; workUnit: string; archiveCadence: "with-integration" | "manual"; storageVersion: string; owner?: OwnerIdentity;
}): Promise<{ summary: IntegrationLifecycleSummary; recordVersion: string | null }> {
  const read = await readWorkUnit(input.store, input.workUnit, input.owner);
  if (read.status === "refused") return refusedSummary(input, read.refusal);
  const record = read.result;
  if (record.conflicts.length > 0) {
    return refusedSummary(input, recordConflictRefusal(record, `Metadata for \`${input.workUnit}\``, "lifecycle.meta-conflict"));
  }
  const parsed = readLifecycleMetaFields(record);
  if (parsed.status === "refused") return refusedSummary(input, parsed.refusal);
  const placement = WorkUnitReadPlacementSchema.safeParse(record.placement);
  const phase = WorkUnitStateSchema.safeParse(parsed.result.state);
  if (!placement.success || !phase.success) return refusedSummary(input, { code: "record-malformed", class: "recoverable",
    reference: record.reference, rule: "integration.lifecycle-position",
    condition: `Metadata for \`${input.workUnit}\` has no valid lifecycle state or placement.`,
    remedy: { text: "Repair the work unit's lifecycle state and placement, then retry." } });
  const position = { phase: phase.data,
    location: placement.data.kind === "backlog" ? placement.data.commitment : placement.data.kind };
  const state = deriveState(position);
  const artifactFacts = lifecycleArtifactFacts(record.content, workUnitMetaPath(record));
  const positioned = input.archiveCadence === "manual"
    ? position.phase === "Integrating" && position.location === "active"
    : position.phase === "Shipped" && position.location === "completed";
  return { recordVersion: record.version, summary: IntegrationLifecycleSummarySchema.parse({
    workUnit: input.workUnit, archiveCadence: input.archiveCadence, storageVersion: input.storageVersion,
    state, position, artifactFacts, complete: positioned && artifactFacts.length === 0,
  }) };
}

function refusedSummary(input: { workUnit: string; archiveCadence: "with-integration" | "manual"; storageVersion: string },
  refusal: StoreRefusal): { summary: IntegrationLifecycleSummary; recordVersion: null } {
  if (refusal.code !== "not-found" && refusal.code !== "record-malformed") {
    throw new Error(`${refusal.condition} ${refusal.remedy.text}`);
  }
  const artifactFacts = refusal.code === "not-found" ? [] : [{ code: "malformed-artifact",
    path: JSON.stringify(refusal.reference), message: `${refusal.condition} ${refusal.remedy.text}` }];
  return { recordVersion: null, summary: IntegrationLifecycleSummarySchema.parse({ workUnit: input.workUnit, archiveCadence: input.archiveCadence,
    storageVersion: input.storageVersion, state: "nonexistent", position: null, artifactFacts, complete: false,
  }) };
}
