/** Read-only facts shared by next-pass offers, lane reads, and response reports. */
import { NextPassFactsSchema, type NextPassFacts } from "./next-pass-facts-schema.js";
export { NextPassFactsSchema, type NextPassFacts } from "./next-pass-facts-schema.js";
import { resolveChangeStats } from "../../../lib/change-stats.js";
import { countCompleteLogicalPasses } from "../lane-progress.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { LaneProgressState, LaneResponsePerformance } from "../core/operation-state-schema.js";
import { currentApprovedDispositionNode, type ApprovedDispositionRecord } from "../core/advisory-records.js";
import type { DispositionReportItem, ProposedDispositionSet } from "../core/disposition-records.js";
import type { ReviewNextPassContext } from "./review-next-pass-schema.js";


function laneLooks(progress: readonly LaneProgressState[]): NextPassFacts["fixChecksSinceLastComplete"][number][] {
  return progress.filter(owner => owner.lane === "standard").flatMap(owner => owner.attempts.flatMap(attempt => {
    const coverage = attempt.local?.effectiveCoverage ?? attempt.hosted?.effectiveCoverage;
    return !attempt.terminalProducer || coverage == null ? [] : [{ producerId: attempt.attemptId,
      logicalPass: attempt.logicalPass, coverage: coverage === "complete" ? "complete" as const : "fix-check" as const,
      outcome: attempt.outcome }];
  }));
}

function materialCount(findings: readonly DispositionReportItem[]): number {
  return findings.filter(finding => finding.sourceVerification === "verified"
    && (finding.verifiedSeverity === "major" || finding.verifiedSeverity === "critical")).length;
}

function materialTrend(looks: readonly NextPassFacts["fixChecksSinceLastComplete"][number][],
  records: readonly ApprovedDispositionRecord[], proposed?: ProposedDispositionSet): NextPassFacts["materialTrend"][number][] {
  const byProducer = new Map(records.map(record => [record.operationId,
    currentApprovedDispositionNode(record).approvedDisposition.dispositionSet]));
  return looks.flatMap(look => {
    const approved = byProducer.get(look.producerId);
    const count = approved === undefined ? look.outcome === "clean" ? 0 : null : materialCount(approved.findings);
    const history = [{ ...look, materialCount: count, provisional: false }];
    if (proposed?.dispositionSet.producerId === look.producerId) {
      history.push({ ...look, materialCount: materialCount(proposed.dispositionSet.findings), provisional: true });
    }
    return history;
  });
}

function leadingPath(locus: string): string {
  return (locus.trim().split(/\s+/u)[0] ?? "").replace(/^`|`$/gu, "").replace(/:\d+(?::\d+)?(?:-\d+)?$/u, "");
}

async function roundSignals(performance: LaneResponsePerformance,
  findings: readonly DispositionReportItem[] | undefined, exec: RawGitExec) {
  if (performance.originatingHeadSha === performance.producedHeadSha) return { outsideCitedLoci: false, addedFiles: false };
  const { affectedPaths, resolveChangeSet } = await import("../../../lib/change-facts.js");
  const changes = await resolveChangeSet(exec, performance.originatingHeadSha, performance.producedHeadSha);
  if (changes.changeSet !== "known") return { outsideCitedLoci: null, addedFiles: null };
  const cited = new Set(findings?.filter(finding => finding.disposition === "fix").map(finding => leadingPath(finding.locus)));
  return { outsideCitedLoci: findings === undefined ? null : affectedPaths(changes.changes).some(path => !cited.has(path)),
    addedFiles: changes.changes.some(change => change.status === "added" || change.status === "copied") };
}

async function fixRounds(progress: readonly LaneProgressState[], records: readonly ApprovedDispositionRecord[],
  exec: RawGitExec): Promise<NextPassFacts["fixRounds"][number][]> {
  const byProducer = new Map(records.map(record => [record.operationId, record]));
  const performances = progress.flatMap(owner => owner.attempts.flatMap(attempt => [
    ...(attempt.responsePerformanceHistory ?? []),
    ...(attempt.responsePerformance === undefined ? [] : [attempt.responsePerformance]),
  ]));
  return Promise.all(performances.map(async performance => {
    const findings = byProducer.get(performance.producerId)?.approvedDispositionLineage
      .find(node => node.approvedDisposition.dispositionSet.dispositionSetId === performance.dispositionSetId)
      ?.approvedDisposition.dispositionSet.findings;
    return { producerId: performance.producerId, dispositionSetId: performance.dispositionSetId,
      originatingHeadSha: performance.originatingHeadSha, producedHeadSha: performance.producedHeadSha,
      ...await roundSignals(performance, findings, exec) };
  }));
}

/** Derive observable lane facts without deciding whether another pass should run. */
export async function deriveNextPassFacts(input: {
  /** Owners in inherited lineage order, oldest first; each owner retains its complete attempt history. */
  readonly progress: readonly LaneProgressState[];
  readonly dispositions: readonly ApprovedDispositionRecord[];
  readonly proposed?: ProposedDispositionSet;
  readonly nextPassContext: ReviewNextPassContext;
  readonly target: Pick<ReviewTarget, "diffBaseSha" | "headSha">;
  readonly ceiling: number;
  readonly exec: RawGitExec;
}): Promise<NextPassFacts> {
  const progress = input.progress.filter(owner => owner.lane === "standard");
  const looks = laneLooks(progress);
  const lastComplete = looks.reduce((last, look, index) => look.coverage === "complete" ? index : last, -1);
  const scope = input.nextPassContext.incremental?.scope;
  const [targetSize, fixSize, rounds] = await Promise.all([
    resolveChangeStats(input.exec, input.target.diffBaseSha, input.target.headSha),
    scope === undefined ? Promise.resolve(null)
      : resolveChangeStats(input.exec, scope.predecessorHeadSha, scope.headSha),
    fixRounds(progress, input.dispositions, input.exec),
  ]);
  return NextPassFactsSchema.parse({
    fixRounds: rounds, chainProven: scope !== undefined, rangeSize: { target: targetSize, fix: fixSize },
    completePasses: progress.reduce((count, owner) => count + countCompleteLogicalPasses(owner.attempts), 0),
    ceiling: input.ceiling, fixChecksSinceLastComplete: looks.slice(lastComplete + 1),
    materialTrend: materialTrend(looks, input.dispositions, input.proposed),
  });
}
