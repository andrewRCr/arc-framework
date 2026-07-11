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

/** Parse only stable routing hints. No payload field returned here is authoritative review state. */
export function normalizeWakeup(eventName: string, payloadValue: unknown): WakeupHint {
  const payload = record(payloadValue, "event-payload");
  const repo = repositoryId(payload);
  if (eventName === "schedule") {
    return { kind: "schedule", repositoryId: repo, pullRequestNumbers: [], headSha: null, workflowName: null };
  }
  if (eventName === "pull_request_target") {
    const pull = record(payload.pull_request, "pull-request");
    return { kind: "pull-request", repositoryId: repo, pullRequestNumbers: [positiveInteger(pull.number, "pull-request-number")], headSha: sha(record(pull.head, "pull-request-head").sha), workflowName: null };
  }
  if (eventName === "status") {
    return { kind: "status", repositoryId: repo, pullRequestNumbers: pullNumbers(payload.pull_requests), headSha: sha(payload.sha), workflowName: null };
  }
  if (eventName === "workflow_run") {
    const run = record(payload.workflow_run, "workflow-run");
    const name = run.name;
    if (typeof name !== "string" || !["CI", "Review Gate Wakeup"].includes(name)) throw new Error("unsupported-workflow-run");
    return { kind: "workflow-run", repositoryId: repo, pullRequestNumbers: pullNumbers(run.pull_requests), headSha: sha(run.head_sha), workflowName: name };
  }
  if (eventName === "check_run") {
    const check = record(payload.check_run, "check-run");
    return { kind: "check-run", repositoryId: repo, pullRequestNumbers: pullNumbers(check.pull_requests), headSha: sha(record(check.check_suite, "check-suite").head_sha), workflowName: null };
  }
  if (eventName === "issue_comment") {
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

/** Ignore the controller's own projection events to avoid recursive wake-ups. */
export function isRecursiveControllerCheck(payloadValue: unknown, appId: number): boolean {
  const payload = record(payloadValue, "event-payload");
  const check = record(payload.check_run, "check-run");
  const app = record(check.app, "check-app");
  return app.id === appId && (check.name === "review-gate-shadow" || check.name === "merge-ok");
}
