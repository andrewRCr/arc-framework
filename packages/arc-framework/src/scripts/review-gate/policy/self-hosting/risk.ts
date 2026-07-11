/** Stable sensitive-path classification for self-hosting review policy. */

/** Review-risk classification. */
export type ReviewRisk = "routine" | "sensitive";

/** Stable reason emitted by the risk classifier. */
export type ReviewRiskReason =
  | "unknown-change-set"
  | "code-surface"
  | "github-control-surface"
  | "arc-system-surface"
  | "strategy-surface"
  | "adr-surface"
  | "agent-brief-surface"
  | "project-prd-surface"
  | "technical-overview-surface"
  | "harness-contract-surface"
  | "routine-doc-surface";

/** Inputs from one canonical changed-path read. */
export interface ReviewRiskInput {
  paths: string[];
  codeSurface: boolean;
}

/** Risk plus every stable reason that applies. */
export interface ReviewRiskDecision {
  risk: ReviewRisk;
  reasons: ReviewRiskReason[];
}

/** Classify stable review risk independently of mutable run-cost history. */
export function classifyReviewRisk(input: ReviewRiskInput): ReviewRiskDecision {
  if (input.paths.length === 0) return { risk: "sensitive", reasons: ["unknown-change-set"] };
  const reasons: ReviewRiskReason[] = [];
  if (input.codeSurface) reasons.push("code-surface");
  if (input.paths.some((path) => path.startsWith(".github/"))) reasons.push("github-control-surface");
  if (input.paths.some((path) => path.startsWith(".arc/system/"))) reasons.push("arc-system-surface");
  if (input.paths.some((path) => path.startsWith(".arc/reference/strategies/"))) reasons.push("strategy-surface");
  if (input.paths.some((path) => path.startsWith(".arc/reference/adr/"))) reasons.push("adr-surface");
  if (input.paths.some((path) => path.startsWith(".arc/reference/briefs/"))) reasons.push("agent-brief-surface");
  if (input.paths.includes(".arc/reference/PROJECT-PRD.md")) reasons.push("project-prd-surface");
  if (input.paths.includes(".arc/reference/TECHNICAL-OVERVIEW.md")) reasons.push("technical-overview-surface");
  if (input.paths.some((path) => path === "AGENTS.md" || path === "CLAUDE.md")) {
    reasons.push("harness-contract-surface");
  }
  return reasons.length === 0
    ? { risk: "routine", reasons: ["routine-doc-surface"] }
    : { risk: "sensitive", reasons };
}
