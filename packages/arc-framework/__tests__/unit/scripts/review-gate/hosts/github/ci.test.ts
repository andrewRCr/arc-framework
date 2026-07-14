import { describe, expect, it } from "vitest";

import {
  GITHUB_ACTIONS_APP_ID,
  resolveCiState,
} from "../../../../../../src/scripts/review-gate/hosts/github/ci.js";
import type {
  CheckRunMutation,
  GitHubCheckRun,
  GitHubCheckRunApi,
} from "../../../../../../src/scripts/review-gate/hosts/github/check-runs.js";

const HEAD = "c".repeat(40);

function run(overrides: Partial<GitHubCheckRun> = {}): GitHubCheckRun {
  return {
    id: 1,
    nodeId: "CR_1",
    name: "ci-ok",
    externalId: "ci:1",
    appId: GITHUB_ACTIONS_APP_ID,
    status: "completed",
    conclusion: "success",
    createdAt: "2026-07-11T20:00:00.000Z",
    htmlUrl: "https://github.test/checks/1",
    ...overrides,
  };
}

class Checks implements GitHubCheckRunApi {
  constructor(private readonly runs: readonly GitHubCheckRun[]) {}

  async list(): Promise<GitHubCheckRun[]> {
    return [...this.runs];
  }

  async create(value: CheckRunMutation): Promise<GitHubCheckRun> {
    void value;
    throw new Error("not used");
  }

  async update(id: number, value: CheckRunMutation): Promise<GitHubCheckRun> {
    void id;
    void value;
    throw new Error("not used");
  }
}

describe("ci-ok state reader", () => {
  it.each([
    ["success", [run()], "success"],
    ["failure", [run({ conclusion: "failure" })], "failure"],
    ["in progress", [run({ status: "in_progress", conclusion: null })], "pending"],
    ["absent", [], "pending"],
  ] as const)("maps %s runs to %s", async (_name, runs, state) => {
    await expect(resolveCiState(new Checks(runs), HEAD)).resolves.toBe(state);
  });

  it("ignores a same-name foreign source and elects the newest pinned-source run", async () => {
    const state = await resolveCiState(new Checks([
      run({ id: 1, appId: "999", conclusion: "failure" }),
      run({ id: 2, createdAt: "2026-07-11T19:00:00.000Z", conclusion: "failure" }),
      run({ id: 3, createdAt: "2026-07-11T21:00:00.000Z", conclusion: "success" }),
    ]), HEAD);

    expect(state).toBe("success");
  });
});
