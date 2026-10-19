/** Routine caller judgments for response scenarios whose assertions concern authority or settlement. */
interface FindingInput { findingId: string; disposition?: unknown; sourceVerification?: unknown }

function findingsFrom(value: unknown): FindingInput[] {
  if (typeof value !== "object" || value === null || !("findings" in value) || !Array.isArray(value.findings)) return [];
  return value.findings.filter((finding): finding is FindingInput => typeof finding === "object" && finding !== null
    && "findingId" in finding && typeof finding.findingId === "string");
}

/** Supply explicit advisory inputs while preserving any report or tags the scenario already provides. */
export function withReviewReport(request: unknown): unknown {
  if (typeof request !== "object" || request === null) return request;
  if ("proposal" in request && !("report" in request)) {
    const findings = findingsFrom(request.proposal);
    return { ...request, report: {
      tags: findings.filter(finding => finding.disposition === "fix")
        .map(finding => ({ findingId: finding.findingId, tag: "local-correction" })),
      fails: findings.map(finding => ({ findingId: finding.findingId,
        fails: finding.sourceVerification === "not-supported" ? "none — the source does not support the finding"
          : "Correctness and failure behavior" })),
      successorRecommendation: "Check approved repairs before considering a successor complete pass.",
      origin: [{ origin: "reviewed artifact", findings: findings.length, newDesignFixes: 0 }],
      reading: { kind: "baseline", rationale: "Use this look's findings to decide its bounded repairs." },
    } };
  }
  if ("dispositions" in request && !("tags" in request) && !("verifiedFix" in request) && !("settledFixTarget" in request)) {
    const state = request.dispositions;
    const set = typeof state === "object" && state !== null && "dispositionSet" in state ? state.dispositionSet : null;
    return { ...request, tags: findingsFrom(set).filter(finding => finding.disposition === "fix")
      .map(finding => ({ findingId: finding.findingId, tag: "local-correction" })) };
  }
  return request;
}
