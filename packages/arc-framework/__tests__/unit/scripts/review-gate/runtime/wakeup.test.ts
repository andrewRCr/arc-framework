import { describe, expect, it } from "vitest";

import { isRecursiveControllerCheck, normalizeWakeup } from "../../../../../src/scripts/review-gate/runtime/wakeup.js";

const repository = { id: 42 };
const sha = "a".repeat(40);

describe("review-gate wake-ups", () => {
  it("retains stale pull-request data only as routing hints", () => {
    expect(normalizeWakeup("pull_request_target", {
      repository, pull_request: { number: 7, head: { sha }, title: "untrusted", labels: [{ name: "required" }] },
    })).toEqual({ kind: "pull-request", repositoryId: 42, pullRequestNumbers: [7], headSha: sha, workflowName: null });
  });

  it("routes CI through workflow runs and provider progress through status", () => {
    expect(normalizeWakeup("workflow_run", {
      repository, workflow_run: { name: "CI", head_sha: sha, pull_requests: [{ number: 7 }] },
    }).kind).toBe("workflow-run");
    expect(normalizeWakeup("status", { repository, sha, context: "CodeRabbit", pull_requests: [{ number: 7 }] }).kind)
      .toBe("status");
  });

  it("rejects malformed and unsupported events", () => {
    expect(() => normalizeWakeup("push", { repository })).toThrow("unsupported-event");
    expect(() => normalizeWakeup("status", { repository, sha: "main" })).toThrow("invalid-head-sha");
  });

  it("recognizes only this App's controller checks as recursive", () => {
    expect(isRecursiveControllerCheck({ check_run: { name: "merge-ok", app: { id: 91 } } }, 91)).toBe(true);
    expect(isRecursiveControllerCheck({ check_run: { name: "merge-ok", app: { id: 92 } } }, 91)).toBe(false);
  });
});
