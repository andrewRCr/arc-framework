/** Conservative statistics over complete equivalent gates; every unsuccessful sample remains visible. */
import { qualifyNativeShardMembership, type NativeMembershipRun } from "../native-shard-qualification.js";
import { NativeShardObservationSchema, type NativeMember } from "../native-shard-evidence.js";
import { checkInvocationArguments, checkShardArguments } from "../../../src/lib/checks/shards.js";
import { identity, type GateSample } from "./model.js";

function members(values: readonly NativeMember[]): string {
  const keys = values.map(value => JSON.stringify([value.project, value.file])).sort();
  if (new Set(keys).size !== keys.length) throw new Error("Duplicated native member.");
  return JSON.stringify(keys);
}
function ordinary(run: NativeMembershipRun): ReturnType<typeof NativeShardObservationSchema.parse> {
  if (run.exitCode !== 0 || run.observations.length !== 1) throw new Error("Missing successful ordinary native observation.");
  const record = NativeShardObservationSchema.parse(run.observations[0]);
  if (record.cycle !== 1 || record.closed !== undefined || record.shard !== undefined || record.shardCalls !== 0
    || record.sortCalls !== 1 || record.assigned.length === 0 || record.preflight !== undefined
    || identity(record.duration) !== identity(run.basis.duration)) throw new Error("Invalid ordinary native observation.");
  for (const actual of [record.selected, record.ordered, record.queued, record.ended]) {
    if (members(actual) !== members(record.assigned)) throw new Error("Ordinary native membership was incomplete.");
  }
  return record;
}
function complete(sample: GateSample): boolean {
  return sample.processExit.exitCode === 0 && sample.processExit.signal === undefined && !sample.processExit.timedOut
    && sample.failure === undefined && sample.report?.completed === true;
}
/** Existing native strict runtime comparison remains authoritative; mixed profiles retain an explicit gap. */
export function qualifyGatePair(baseline: GateSample, distributed: GateSample): { qualified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!complete(baseline) || !complete(distributed)) reasons.push("One or both complete gate executions were unsuccessful.");
  if (baseline.request.arm !== "routed-unsharded" || distributed.request.arm !== "distributed") reasons.push("Comparison arms are not routed baseline and declaration-derived execution.");
  const left = baseline.report, right = distributed.report;
  if (left === undefined || right === undefined || left.comparisonIdentity === undefined || left.comparisonIdentity !== right.comparisonIdentity) {
    reasons.push("Fixed source, selection, declaration, environment or complete check set differs.");
  }
  if (left !== undefined && right !== undefined) {
    reasons.push(...left.coverageErrors, ...right.coverageErrors);
    if (left.telemetry.error !== undefined || right.telemetry.error !== undefined
      || left.telemetry.missingPlanIds?.length || right.telemetry.missingPlanIds?.length) reasons.push("Provider phase/admission observations are incomplete; raw execution outcomes remain retained.");
    if (left.ownerMode === undefined || left.ownerMode !== right.ownerMode) reasons.push("Owner routing mode is missing or differs.");
    if (left.declaration === undefined || right.declaration === undefined) reasons.push("Actual declaration evidence is missing.");
    else for (const id of left.expectedChecks) {
      const actual = left.outcome?.kind === "result" ? left.outcome.result.checks.find(check => check.id === id) : undefined;
      const other = right.outcome?.kind === "result" ? right.outcome.result.checks.find(check => check.id === id) : undefined;
      if (actual?.outcome !== other?.outcome) reasons.push(`Selected check outcome differs: ${id}`);
      const a = left.captures.find(value => value.checkId === id), b = right.captures.find(value => value.checkId === id);
      if (a !== undefined || b !== undefined) {
        if (a === undefined || b === undefined || a.environmentIdentity !== b.environmentIdentity
          || identity(a.logicalRequest) !== identity(b.logicalRequest)
          || identity(a.source.coordinates) !== identity(b.source.coordinates)) reasons.push(`Captured source/environment differs: ${id}`);
        else {
          const check = right.declaration.instrumented.checks[id]!;
          const suffixes = check.shards?.routed ? checkShardArguments(check.shards) : [undefined];
          const expected = a.plan.invocations.flatMap((invocation, index) => suffixes.map(suffix => ({
            argv: checkInvocationArguments(invocation.argv, [], suffix, invocation.shell), cwd: invocation.cwd,
            shell: invocation.shell, commandContent: invocation.commandContent, batch: index + 1,
          })));
          const observed = b.plan.invocations.map((invocation, index) => ({ argv: invocation.argv, cwd: invocation.cwd,
            shell: invocation.shell, commandContent: invocation.commandContent, batch: b.plan.coordinates?.[index]?.batch ?? index + 1 }));
          if (identity(expected) !== identity(observed)) reasons.push(`Plans differ beyond native shard expansion: ${id}`);
        }
      }
      const original = right.declaration.original.checks[id]!;
      const observedNative = left.native[id], candidateNative = right.native[id];
      if (observedNative === undefined && candidateNative === undefined) {
        if (left.nativeChecks.includes(id) && actual?.outcome === "passed") reasons.push(`Expected native coverage is missing: ${id}`);
        continue;
      }
      try {
        if (observedNative?.length !== 1 || candidateNative === undefined) throw new Error("Native baseline or complete matrix is missing.");
        if (original.shards?.routed) qualifyNativeShardMembership(observedNative[0]!, candidateNative, original.shards.count);
        else {
          if (candidateNative.length !== 1) throw new Error("Unexpected ordinary native matrix.");
          const first = ordinary(observedNative[0]!), second = ordinary(candidateNative[0]!);
          if (identity(observedNative[0]!.basis) !== identity(candidateNative[0]!.basis)
            || identity(first.runtime) !== identity(second.runtime) || identity(first.duration) !== identity(second.duration)
            || members(first.assigned) !== members(second.assigned)) throw new Error("Ordinary native basis, profile or membership differs.");
        }
      } catch (cause) { reasons.push(`Native coverage unqualified for ${id}: ${String(cause)}`); }
    }
    if (Object.keys(left.native).length === 0 || Object.keys(right.native).length === 0) reasons.push("No observed native coverage; this execution is not a coverage-equivalent speedup sample.");
  }
  return { qualified: reasons.length === 0, reasons };
}
function distribution(values: readonly number[]) {
  if (values.length === 0) return { count: 0, median: null, min: null, max: null };
  const ordered = [...values].sort((a, b) => a - b), middle = Math.floor(ordered.length / 2);
  return { count: ordered.length, median: ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2,
    min: ordered[0]!, max: ordered.at(-1)! };
}
export function summarizeGateSamples(samples: readonly GateSample[]) {
  const pairs = [...new Set(samples.map(sample => sample.request.pairId))].map(pairId => {
    const baseline = samples.filter(sample => sample.request.pairId === pairId && sample.request.arm === "routed-unsharded");
    const distributed = samples.filter(sample => sample.request.pairId === pairId && sample.request.arm === "distributed");
    return { pairId, ...(baseline.length === 1 && distributed.length === 1 ? qualifyGatePair(baseline[0]!, distributed[0]!)
      : { qualified: false, reasons: ["Missing or duplicated comparison arm."] }) };
  });
  const eligible = new Set(pairs.filter(pair => pair.qualified).map(pair => pair.pairId));
  const gates = [...new Set(samples.map(sample => sample.request.gate))].map(gate => ({ gate,
    baseline: distribution(samples.filter(sample => sample.request.gate === gate && sample.request.arm === "routed-unsharded"
      && eligible.has(sample.request.pairId)).map(sample => sample.collectionMs)),
    distributed: distribution(samples.filter(sample => sample.request.gate === gate && sample.request.arm === "distributed"
      && eligible.has(sample.request.pairId)).map(sample => sample.collectionMs)) }));
  const batches = [...new Set(samples.map(sample => `${sample.request.batchId}:${sample.request.arm}`))].map(key => {
    const group = samples.filter(sample => `${sample.request.batchId}:${sample.request.arm}` === key);
    const makespanMs = Math.max(...group.map(sample => sample.finishedAt)) - Math.min(...group.map(sample => sample.startedAt));
    return { key, requested: group.length, completed: group.filter(complete).length, qualified: group.filter(sample => eligible.has(sample.request.pairId)).length,
      makespanMs, qualifiedMakespanMs: group.every(sample => complete(sample) && eligible.has(sample.request.pairId)) ? makespanMs : null };
  });
  return { samples, pairs, gates, batches, requested: samples.length, completed: samples.filter(complete).length,
    nativeContext: samples.filter(sample => sample.request.arm === "native-local") };
}
