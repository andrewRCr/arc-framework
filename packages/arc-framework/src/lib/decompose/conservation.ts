/** Current destination locator resolution over version-bound stored records. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { V3DecomposeContentUnit, V3DecomposeContentResolution } from "../work-unit/decompose-content.js";
import type { CutMap } from "./cut-map-schema.js";
import type { Store } from "../store/contract.js";
import { posix } from "node:path";
import { scanV3DecomposeContent, resolveV3DecomposeContentLocator } from "../work-unit/decompose-content.js";
import { acquireLifecycleRecords } from "../work-unit/prepared-lifecycle-write.js";
import { lifecycleRecordPath, cohortDocumentPath } from "../store/lifecycle-record-path.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { decomposeReadCache } from "./read-cache.js";
import { checkDecomposeRecordConflicts, DECOMPOSE_SOURCE_CONFLICT_REMEDY } from "./source-conflicts.js";
import { sameReference } from "../store/identity.js";
import { checkDecomposeOriginDestinations } from "./allocation-rules.js";

/** One allocation's current resolved section and its exact stored-record basis. */
export interface DecomposeResolvedAllocation {
  allocationIndex: number; sourceId: string; destinationId: string; record: StoreRecord; unit: V3DecomposeContentUnit;
}
/** Resolved content and selected destination records retained for revalidation. */
export interface DecomposeConservation { allocations: readonly DecomposeResolvedAllocation[]; records: readonly StoreRecord[] }
/** Require every destination allocation's complete saved locator to resolve exactly once. */
export async function checkDecomposeConservation(ctx: DecomposeContext, input: DecomposeTerminalRecords): Promise<DecomposeResult<DecomposeConservation>> {
  const origin = checkDecomposeOriginDestinations(input.map, input.homes);
  if (origin !== undefined) {
    const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
    return { ...origin, remedy: { argv: [...argv],
      text: `Generate a revision with ${renderV3DecomposeArgv(argv)} and choose a destination other than the origin,`
        + " or retain extraction scope with retained-origin; preview and apply the corrected revision, then retry --finish." } };
  }
  const store = decomposeReadCache(ctx.executor.store, input.records);
  const groups = new Map<string, readonly TargetArtifact[]>();
  const scans = new Map<StoreRecord, ReturnType<typeof scanV3DecomposeContent>>();
  const allocations: DecomposeResolvedAllocation[] = [];
  for (const [allocationIndex, allocation] of input.map.authoring.sourceAllocations.entries()) {
    const target = allocation.disposition;
    if (target.kind !== "target") continue;
    const acquired = await cachedTargetArtifacts(store, input, target.destinationId, groups);
    if (acquired.status === "refused") return acquired;
    const artifacts = acquired.result;
    const matches = artifacts.filter(artifact => artifact.basename === target.targetLocator.artifact);
    const artifact = matches.length === 1 ? matches[0] : undefined;
    if (artifact === undefined) return unresolved(input, allocationIndex, "The destination artifact does not resolve exactly once.");
    const conflicts = checkDecomposeRecordConflicts([artifact.record], "allocated destination", DECOMPOSE_SOURCE_CONFLICT_REMEDY);
    if (conflicts !== undefined) return conflicts;
    const resolved = resolveTargetUnit(artifact, target.targetLocator, scans);
    if (resolved.status === "rejected") return unresolved(input, allocationIndex, resolved.reason);
    allocations.push({ allocationIndex, sourceId: allocation.sourceId, destinationId: target.destinationId,
      record: artifact.record, unit: resolved.unit });
  }
  const records = allocations.map(allocation => allocation.record).filter((record, index, all) =>
    all.findIndex(other => sameReference(record.reference, other.reference)) === index);
  return { status: "ok", result: { allocations, records } };
}

async function cachedTargetArtifacts(store: Store, input: DecomposeTerminalRecords, destinationId: string,
  groups: Map<string, readonly TargetArtifact[]>): Promise<DecomposeResult<readonly TargetArtifact[]>> {
  const cached = groups.get(destinationId);
  if (cached !== undefined) return { status: "ok", result: cached };
  const acquired = await acquireTargetArtifacts(store, input, destinationId);
  if (acquired.status === "ok") groups.set(destinationId, acquired.result);
  return acquired;
}

interface TargetArtifact { basename: string; record: StoreRecord }

type TargetLocator = Extract<CutMap["authoring"]["sourceAllocations"][number]["disposition"], { kind: "target" }>["targetLocator"];

function resolveTargetUnit(artifact: TargetArtifact, locator: TargetLocator,
  scans: Map<StoreRecord, ReturnType<typeof scanV3DecomposeContent>>): V3DecomposeContentResolution {
  let scan = scans.get(artifact.record);
  if (scan === undefined) {
    scan = scanV3DecomposeContent(artifact.basename, new TextEncoder().encode(artifact.record.content));
    scans.set(artifact.record, scan);
  }
  return scan.status === "rejected" ? scan : resolveV3DecomposeContentLocator(scan.units, locator, artifact.basename);
}

async function acquireTargetArtifacts(store: Store, input: DecomposeTerminalRecords, destinationId: string): Promise<DecomposeResult<readonly TargetArtifact[]>> {
  const destination = input.map.authoring.destinations.find(candidate => candidate.destinationId === destinationId);
  if (destination?.kind === "cohort-coordination") {
    const cohort = input.cohorts.find(candidate => candidate.path === destination.cohort);
    return { status: "ok", result: cohort === undefined ? []
      : [{ basename: posix.basename(cohortDocumentPath(cohort.record)), record: cohort.record }] };
  }
  const home = input.homes.find(candidate => candidate.destinationId === destinationId);
  const primary = home?.primary ?? input.members.find(candidate => candidate.destinationId === destinationId)?.primary;
  if (primary === undefined || primary === null) return { status: "ok", result: [] };
  let records = home?.records;
  if (records === undefined) {
    const acquired = await acquireLifecycleRecords(store, primary.reference);
    if (acquired.status === "refused") return decomposeStoreRefusal(acquired.refusal);
    records = acquired.result;
  }
  return { status: "ok", result: records.flatMap(record => {
    const path = lifecycleRecordPath(primary, record);
    return path === null ? [] : [{ basename: posix.basename(path), record }];
  }) };
}

function unresolved(input: DecomposeTerminalRecords, allocationIndex: number, message: string): DecomposeRefusal {
  const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
  return { status: "refused", reason: "locator-unresolved", class: "recoverable",
    locus: `authoring.sourceAllocations.${allocationIndex}.disposition.targetLocator`, message,
    remedy: { text: `Restore the target section or update this allocation's locator with ${renderV3DecomposeArgv(argv)}.`, argv: [...argv] } };
}
