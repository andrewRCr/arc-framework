/** Field-by-field comparison of an approved response's policy request with its producer binding. */

import { describe, expect, it } from "vitest";

import {
  approvalPolicyBindingMismatches,
  type ApprovalPolicyBinding,
} from "../../../../../src/scripts/review-gate/policy/approval-policy-binding.js";
import type { ReviewPolicyCommandRequest } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { responsePolicyRequestFixture } from "../../../../fixtures/review-response-policy.js";

const head = "a".repeat(40);
const otherHead = "b".repeat(40);

const binding: ApprovalPolicyBinding = {
  lane: "standard",
  headSha: head,
  pullRequest: 7,
  repository: "owner/repo",
  scopeMode: "whole-target",
  completedPasses: 1,
  finalAttempt: { outcome: "findings", reviewOperationId: "operation-1" },
};

const request = responsePolicyRequestFixture({ headSha: head, pullRequest: 7 });

describe("approval policy binding mismatches", () => {
  it.each<[string, ReviewPolicyCommandRequest, ApprovalPolicyBinding]>([
    ["a request naming every bound field", request, binding],
    ["a repository differing only in case", { ...request, target: { ...request.target, repository: "Owner/Repo" } },
      binding],
    ["any repository when the binding names none", { ...request, target: { ...request.target, pullRequest: null,
      repository: "any/repo" } }, { ...binding, pullRequest: null, repository: undefined }],
    ["an explicit whole-target selection of the same target",
      { ...request, scopeSelection: { mode: "whole-target", target: request.target } }, binding],
  ])("adds no clause for %s", (_name, candidate, expected) => {
    expect(approvalPolicyBindingMismatches(candidate, expected)).toEqual([]);
  });

  it.each<[string, ReviewPolicyCommandRequest, ApprovalPolicyBinding, string]>([
    ["the lane", { ...request, lane: "frontline" }, binding, 'lane is "frontline", expected "standard"'],
    ["the head", { ...request, target: { ...request.target, headSha: otherHead } }, binding,
      `target.headSha is "${otherHead}", expected "${head}"`],
    ["the pull request", { ...request, target: { ...request.target, pullRequest: null } }, binding,
      "target.pullRequest is null, expected 7"],
    ["the repository", { ...request, target: { ...request.target, repository: "other/repo" } }, binding,
      'target.repository is "other/repo", expected "owner/repo"'],
    ["the scope mode", { ...request, scopeSelection: { mode: "chunked", target: request.target } }, binding,
      'scopeSelection.mode is "chunked", expected "whole-target"'],
    ["an omitted selection against a chunked binding", request, { ...binding, scopeMode: "chunked" },
      'scopeSelection.mode is "whole-target", expected "chunked"'],
    ["a stale scope target", { ...request, scopeSelection: { mode: "whole-target",
      target: { ...request.target, headSha: otherHead } } }, binding,
      "scopeSelection.target differs from target, expected the same target"],
    ["the pass count", { ...request, completedPasses: 2 }, binding, "completedPasses is 2, expected 1"],
    ["no attempt", { ...request, attempts: [] }, binding,
      "attempts end in no attempt, expected the findings attempt operation-1"],
    ["a non-terminal final attempt", { ...request, attempts: [{ sourceId: "delegated-agent", outcome: "partial" }] },
      binding, "attempts end in a partial attempt without an operation, expected the findings attempt operation-1"],
    ["a clean final attempt", { ...request, attempts: [{ sourceId: "delegated-agent", outcome: "clean",
      reviewOperationId: "operation-1" }] }, binding,
      "attempts end in a clean attempt operation-1, expected the findings attempt operation-1"],
    ["another producer's findings", { ...request, attempts: [{ sourceId: "delegated-agent", outcome: "findings",
      reviewOperationId: "operation-2" }] }, binding,
      "attempts end in a findings attempt operation-2, expected the findings attempt operation-1"],
  ])("names only %s when it alone differs", (_name, candidate, expected, clause) => {
    expect(approvalPolicyBindingMismatches(candidate, expected)).toEqual([clause]);
  });
});
