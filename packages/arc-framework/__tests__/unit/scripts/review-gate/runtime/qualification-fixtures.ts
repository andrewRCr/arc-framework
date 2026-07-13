import {
  QUALIFICATION_RUBRIC_DIMENSIONS,
  type QualificationCellId,
  type QualificationCellResult,
  type QualificationOutcome,
  type QualificationScope,
} from "../../../../../src/scripts/review-gate/runtime/qualification-contract.js";

const SHA = "a".repeat(40);
const HASH = "b".repeat(64);

export function qualificationScope(): QualificationScope {
  return {
    repositoryId: "100",
    repositoryRef: "o/r",
    defaultBranch: "main",
    defaultBranchSha: SHA,
    implementationSha: SHA,
    qualificationPullRequest: 8,
    disposablePullRequest: 7,
    disposableHeadSha: "c".repeat(40),
    expectedActorIdentity: "200",
    policyVersion: HASH,
    parserVersion: "1",
    parserDigest: "d".repeat(64),
    rubricVersion: "independent-analysis/v1",
    guidanceDigests: { codex: "e".repeat(64) },
    sourceIdentities: { coderabbit: "coderabbit-pr", codex: "codex-pr" },
    terminalUnavailableMode: "parser-only",
  };
}

const outcomes: Record<QualificationCellId, QualificationOutcome> = {
  "pending-first": "pending",
  "coderabbit-label-trigger": "triggered",
  "coderabbit-command-trigger": "triggered",
  "coderabbit-clean": "clean",
  "coderabbit-findings": "findings",
  "coderabbit-stale": "stale",
  "coderabbit-unknown": "unknown",
  "codex-comment-trigger": "triggered",
  "codex-clean": "clean",
  "codex-findings": "findings",
  "codex-stale": "stale",
  "codex-unknown": "unknown",
  "codex-connected-account": "parser-only",
  "provider-fallback": "fallback",
  "await-ci": "woken",
  "await-review": "woken",
  "event-repair": "repaired",
  "finding-fix": "settled",
  "finding-nonfix": "settled",
  "provider-closure": "settled",
  "ledger-reconstruction": "reconstructed",
  "token-stateless": "supported",
  "token-classic": "supported",
  "repair-authority": "repaired",
};

export function qualificationCell(cellId: QualificationCellId): QualificationCellResult {
  const scope = qualificationScope();
  const provider = cellId.startsWith("coderabbit-") || cellId.startsWith("codex-");
  return {
    cellId,
    status: "passed",
    outcome: outcomes[cellId],
    repositoryId: scope.repositoryId,
    pullRequestNumber: scope.disposablePullRequest,
    headSha: scope.disposableHeadSha,
    workflowSha: scope.defaultBranchSha,
    sourceIdentity: cellId.startsWith("coderabbit-") ? "coderabbit-pr"
      : cellId.startsWith("codex-") ? "codex-pr" : "arc-controller",
    actorIdentity: scope.expectedActorIdentity,
    triggerPath: cellId === "coderabbit-label-trigger" ? "label"
      : ["coderabbit-command-trigger", "codex-comment-trigger"].includes(cellId) ? "comment" : null,
    evidenceRef: `https://github.com/o/r/actions/${cellId}`,
    rubricDimensions: provider ? [...QUALIFICATION_RUBRIC_DIMENSIONS] : [],
    admissibleActor: false,
    fixture: false,
    rawCheckpointHash: HASH,
  };
}
