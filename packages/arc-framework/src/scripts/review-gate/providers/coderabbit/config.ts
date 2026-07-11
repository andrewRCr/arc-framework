/** Static repository-delta validation and live resolved-config qualification. */

import { arrayAt, exactKeys, objectAt, stringAt } from "../../core/validation.js";

/** Minimal repository-owned CodeRabbit configuration. */
export interface CodeRabbitRepositoryDelta {
  inheritance: true;
  reviews: {
    request_changes_workflow: true;
    commit_status: true;
    fail_commit_status: true;
    auto_review: {
      enabled: true;
      labels: ["arc-review-gate"];
      drafts: false;
      auto_incremental_review: false;
      description_keyword: "";
    };
  };
}

function exactBoolean(value: unknown, expected: boolean, path: string): true | false {
  if (value !== expected) throw new Error(`${path}: expected ${String(expected)}`);
  return expected;
}

/** Reject any repository setting outside the controller-owned handshake delta. */
export function validateCodeRabbitRepositoryDelta(input: unknown): CodeRabbitRepositoryDelta {
  const root = objectAt(input, "coderabbit");
  exactKeys(root, ["inheritance", "reviews"], "coderabbit");
  exactBoolean(root.inheritance, true, "coderabbit.inheritance");
  const reviews = objectAt(root.reviews, "coderabbit.reviews");
  exactKeys(reviews, [
    "request_changes_workflow",
    "commit_status",
    "fail_commit_status",
    "auto_review",
  ], "coderabbit.reviews");
  exactBoolean(reviews.request_changes_workflow, true, "coderabbit.reviews.request_changes_workflow");
  exactBoolean(reviews.commit_status, true, "coderabbit.reviews.commit_status");
  exactBoolean(reviews.fail_commit_status, true, "coderabbit.reviews.fail_commit_status");
  const autoReview = objectAt(reviews.auto_review, "coderabbit.reviews.auto_review");
  exactKeys(autoReview, [
    "enabled",
    "labels",
    "drafts",
    "auto_incremental_review",
    "description_keyword",
  ], "coderabbit.reviews.auto_review");
  exactBoolean(autoReview.enabled, true, "coderabbit.reviews.auto_review.enabled");
  exactBoolean(autoReview.drafts, false, "coderabbit.reviews.auto_review.drafts");
  exactBoolean(autoReview.auto_incremental_review, false, "coderabbit.reviews.auto_review.auto_incremental_review");
  const labels = arrayAt(autoReview.labels, "coderabbit.reviews.auto_review.labels", stringAt);
  if (labels.length !== 1 || labels[0] !== "arc-review-gate") {
    throw new Error("coderabbit.reviews.auto_review.labels: expected only arc-review-gate");
  }
  if (autoReview.description_keyword !== "") {
    throw new Error("coderabbit.reviews.auto_review.description_keyword: expected empty");
  }
  return {
    inheritance: true,
    reviews: {
      request_changes_workflow: true,
      commit_status: true,
      fail_commit_status: true,
      auto_review: {
        enabled: true,
        labels: ["arc-review-gate"],
        drafts: false,
        auto_incremental_review: false,
        description_keyword: "",
      },
    },
  };
}

/** Human-auditable evidence produced by CodeRabbit's resolved configuration command. */
export interface ResolvedCodeRabbitConfigurationEvidence {
  command: string;
  observedAt: string;
  effectiveAutomaticPaths: string[];
}

/** Keep label qualification disabled unless the effective trigger set is exclusive. */
export function qualifyResolvedCodeRabbitConfiguration(
  evidence: ResolvedCodeRabbitConfigurationEvidence,
): { qualified: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (evidence.command !== "@coderabbitai configuration") reasons.push("wrong-command");
  if (!Number.isFinite(Date.parse(evidence.observedAt))) reasons.push("invalid-observed-at");
  if (
    evidence.effectiveAutomaticPaths.length !== 1
    || evidence.effectiveAutomaticPaths[0] !== "label:arc-review-gate"
  ) reasons.push("non-exclusive-automatic-paths");
  return { qualified: reasons.length === 0, reasons };
}
