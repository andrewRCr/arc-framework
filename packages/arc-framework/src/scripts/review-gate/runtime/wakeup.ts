/** Trusted normalization of GitHub wake-up payloads into discovery hints. */

export type WakeupKind =
  | "pull-request"
  | "status"
  | "workflow-run"
  | "check-run"
  | "issue-comment"
  | "dispatch"
  | "schedule";

export interface WakeupHint {
  kind: WakeupKind;
  repositoryId: number;
  pullRequestNumbers: number[];
  headSha: string | null;
  workflowName: string | null;
}

const SHA = /^[0-9a-f]{40}$/u;

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`invalid-${name}`);
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`invalid-${name}`);
  return value as number;
}

function repositoryId(payload: Record<string, unknown>): number {
  return positiveInteger(record(payload.repository, "repository").id, "repository-id");
}

function sha(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !SHA.test(value)) throw new Error("invalid-head-sha");
  return value;
}

function pullNumbers(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("invalid-pull-requests");
  return [...new Set(value.map((item) => positiveInteger(record(item, "pull-request").number, "pull-request-number")))];
}

function requireAction(payload: Record<string, unknown>, allowed: string[]): void {
  if (typeof payload.action !== "string" || !allowed.includes(payload.action)) {
    throw new Error("unsupported-event-action");
  }
}

/** Parse only stable routing hints. No payload field returned here is authoritative review state. */
export function normalizeWakeup(eventName: string, payloadValue: unknown): WakeupHint {
  const payload = record(payloadValue, "event-payload");
  const repo = repositoryId(payload);
  if (eventName === "schedule") {
    return { kind: "schedule", repositoryId: repo, pullRequestNumbers: [], headSha: null, workflowName: null };
  }
  if (eventName === "pull_request_target") {
    requireAction(payload, [
      "opened", "reopened", "synchronize", "ready_for_review", "converted_to_draft", "edited", "labeled",
      "unlabeled", "review_requested", "review_request_removed",
    ]);
    const pull = record(payload.pull_request, "pull-request");
    return { kind: "pull-request", repositoryId: repo, pullRequestNumbers: [positiveInteger(pull.number, "pull-request-number")], headSha: sha(record(pull.head, "pull-request-head").sha), workflowName: null };
  }
  if (eventName === "status") {
    return { kind: "status", repositoryId: repo, pullRequestNumbers: pullNumbers(payload.pull_requests), headSha: sha(payload.sha), workflowName: null };
  }
  if (eventName === "workflow_run") {
    requireAction(payload, ["completed"]);
    const run = record(payload.workflow_run, "workflow-run");
    const name = run.name;
    if (typeof name !== "string" || !["CI", "Review Gate Wakeup"].includes(name)) throw new Error("unsupported-workflow-run");
    return { kind: "workflow-run", repositoryId: repo, pullRequestNumbers: pullNumbers(run.pull_requests), headSha: sha(run.head_sha), workflowName: name };
  }
  if (eventName === "check_run") {
    requireAction(payload, ["created", "completed", "rerequested"]);
    const check = record(payload.check_run, "check-run");
    return { kind: "check-run", repositoryId: repo, pullRequestNumbers: pullNumbers(check.pull_requests), headSha: sha(record(check.check_suite, "check-suite").head_sha), workflowName: null };
  }
  if (eventName === "issue_comment") {
    requireAction(payload, ["created", "edited", "deleted"]);
    const issue = record(payload.issue, "issue");
    if (!("pull_request" in issue)) throw new Error("issue-comment-not-pull-request");
    return { kind: "issue-comment", repositoryId: repo, pullRequestNumbers: [positiveInteger(issue.number, "pull-request-number")], headSha: null, workflowName: null };
  }
  if (eventName === "workflow_dispatch") {
    const inputs = record(payload.inputs, "dispatch-inputs");
    return { kind: "dispatch", repositoryId: repo, pullRequestNumbers: [positiveInteger(Number(inputs.pull_request), "pull-request-number")], headSha: sha(inputs.head_sha), workflowName: null };
  }
  throw new Error(`unsupported-event:${eventName}`);
}

/** Context names the controller App authors; a completed one of these must never re-trigger reconciliation. */
const CONTROLLER_CHECK_NAMES = new Set(["review-gate-shadow", "merge-ok"]);

/**
 * Whether a `check_run` wake-up is the controller's own created/completed projection,
 * which must be suppressed before candidate expansion so publishing a verdict
 * cannot recursively wake another reconciliation. Only a `created` or `completed` event
 * authored by the expected App for a controller-owned context suppresses;
 * `rerequested`, other-App, other-name, and malformed events stay eligible and
 * continue through the normal fail-closed/current-state path.
 */
export function isControllerSelfCheckEvent(payloadValue: unknown, expectedAppId: number): boolean {
  try {
    const payload = record(payloadValue, "event-payload");
    if (payload.action !== "created" && payload.action !== "completed") return false;
    const check = record(payload.check_run, "check-run");
    const app = record(check.app, "check-app");
    return app.id === expectedAppId && typeof check.name === "string" && CONTROLLER_CHECK_NAMES.has(check.name);
  } catch {
    return false;
  }
}
