import { describe, expect, it, vi } from "vitest";

import {
  PlanningLaneGitHubApiError,
  readGitHubPlanningLaneOwnershipFacts,
} from "../../../src/lib/work-unit/github-planning-lane-ownership.js";

describe("readGitHubPlanningLaneOwnershipFacts", () => {
  it("reads branch protection, rules, and merge queue independently", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({
        required_status_checks: {
          strict: false,
          contexts: ["arc-cleared"],
        },
      })
      .mockResolvedValueOnce([{
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [{ context: "ci-ok" }],
        },
      }])
      .mockResolvedValueOnce([{ type: "merge_queue", parameters: {} }]);

    const result = await readGitHubPlanningLaneOwnershipFacts(
      "example/project",
      "release/current",
      "arc-cleared",
      { get },
    );

    expect(get).toHaveBeenCalledTimes(3);
    expect(get).toHaveBeenNthCalledWith(
      1,
      "repos/example/project/branches/release%2Fcurrent/protection",
    );
    expect(get).toHaveBeenNthCalledWith(
      2,
      "repos/example/project/rules/branches/release%2Fcurrent?per_page=100",
    );
    expect(get).toHaveBeenNthCalledWith(
      3,
      "repos/example/project/rules/branches/release%2Fcurrent?per_page=100",
    );
    expect(result).toEqual({
      branchProtection: {
        state: "checked",
        requiredContext: true,
        baseCurrency: false,
      },
      rules: {
        state: "checked",
        requiredContext: false,
        baseCurrency: true,
      },
      mergeQueue: {
        state: "checked",
        requiredContext: false,
        baseCurrency: true,
      },
    });
  });

  it("distinguishes absent branch protection from forbidden rules reads", async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new PlanningLaneGitHubApiError("not protected", 404))
      .mockRejectedValueOnce(new PlanningLaneGitHubApiError("forbidden", 403))
      .mockRejectedValueOnce(new PlanningLaneGitHubApiError("hidden", 404));

    await expect(readGitHubPlanningLaneOwnershipFacts(
      "example/project",
      "main",
      "arc-cleared",
      { get },
    )).resolves.toEqual({
      branchProtection: {
        state: "checked",
        requiredContext: false,
        baseCurrency: false,
      },
      rules: { state: "forbidden" },
      mergeQueue: { state: "forbidden" },
    });
  });
});
