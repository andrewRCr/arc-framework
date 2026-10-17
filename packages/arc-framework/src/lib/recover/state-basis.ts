/** Recovery state-baseline replacement, independent of retained code evidence. */
import type { CompactionSeed } from "../compaction-seed/schema.js";
import type { RecoveryAuditProbeState } from "./audit.js";
import type { Store } from "../store/contract.js";
import type { StoreSyncPort } from "../store/operational-sync.js";
import { readStateHistory, StateHistoryRefusal } from "../handoff/state-history.js";
import { CompactionSeedSchema } from "../compaction-seed/schema.js";
import { identifyWorkUnitArtifactPath } from "../layout/index.js";

/** State continuity outcome reported alongside the read-only audit. */
export interface RecoveryStateBasis { seed: CompactionSeed; rebuilt: boolean }
/** Resolve the state baseline while retaining all original code and subject evidence.
 * @param input - Seed, fresh recovery subject, selected store and history synchronization.
 * @returns Seed used in memory by this audit; never writes the original seed.
 */
export async function resolveRecoveryStateBasis(input: { seed: CompactionSeed; recover: Pick<RecoveryAuditProbeState, "recoveryFrame" | "loadSet" | "taskCursor">; store: Store; sync?: StoreSyncPort }): Promise<RecoveryStateBasis> {
  const { seed, store, recover } = input;
  if (!store.capabilities.stateOffBranch) return { seed, rebuilt: false };
  const current = await readStateHistory(() => store.version(), input.sync);
  if (seed.stateVersion !== null) {
    const from = seed.stateVersion;
    try {
      await readStateHistory(() => store.changes({ from, to: current, references: [] }), input.sync);
      return { seed, rebuilt: false };
    } catch (error) {
      if (!(error instanceof StateHistoryRefusal) || error.refusal.code !== "state-unresolvable") throw error;
    }
  }
  requireOriginalSubject(seed, recover);
  if (seed.activeWorkUnit === null) return { rebuilt: true, seed: { ...seed, stateVersion: current } };
  if (!recover.loadSet.ok) throw new Error(`Cannot rebuild recovery load set: ${recover.loadSet.error.message}`);
  const cursor = recover.taskCursor;
  if (cursor !== undefined && (!cursor.ok || cursor.value.status === "missing" || cursor.value.status === "malformed")) {
    throw new Error("Cannot rebuild recovery state without a readable task cursor. Repair the task list and retry recovery.");
  }
  return { rebuilt: true, seed: CompactionSeedSchema.parse({ ...seed, stateVersion: current, loadSet: recover.loadSet.value,
    taskCursor: cursor?.ok === true && cursor.value.status === "found" ? cursor.value.cursor : null }) };
}

function requireOriginalSubject(seed: CompactionSeed, recover: Pick<RecoveryAuditProbeState, "recoveryFrame" | "loadSet">): void {
  if (!recover.recoveryFrame.ok) throw new Error(`Cannot rebuild recovery state: ${recover.recoveryFrame.error.message}`);
  const frame = recover.recoveryFrame.value;
  if (frame.checkoutPath !== seed.locus.checkoutPath || frame.parentCheckoutPath !== seed.locus.parentCheckoutPath
    || frame.checkoutPath !== seed.repoRoot) throw new Error("Cannot rebuild recovery state in another checkout. Resume in the seed's original checkout.");
  const sameWorkUnit = frame.kind === "resolved" && frame.subject.kind === "work-unit" && frame.subject.key === seed.activeWorkUnit;
  const parentMetas = recover.loadSet.ok ? recover.loadSet.value.entries.flatMap(entry => {
    const artifact = identifyWorkUnitArtifactPath(entry.path);
    return artifact?.artifact === "meta" ? [artifact.slug] : [];
  }) : [];
  const sameParentContext = frame.kind === "resolved" && frame.subject.kind !== "work-unit"
    && seed.locus.parentCheckoutPath !== null && parentMetas.length === 1 && parentMetas[0] === seed.activeWorkUnit;
  if (seed.activeWorkUnit !== null && !sameWorkUnit && !sameParentContext) {
    throw new Error(`Cannot rebuild recovery state for a different subject. Resume the seed's subject ${seed.activeWorkUnit}.`);
  }
}
