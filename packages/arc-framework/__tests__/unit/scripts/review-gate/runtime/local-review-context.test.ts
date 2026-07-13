import { describe, expect, it } from "vitest";

import {
  resolveLocalReviewContext,
} from "../../../../../src/scripts/review-gate/runtime/local-review-context.js";
import type { ProcessRunner } from "../../../../../src/scripts/review-gate/runtime/gh-action-port.js";

const HEAD_SHA = "a".repeat(40);

class ScriptedProcess implements ProcessRunner {
  private readonly outputs: string[];

  constructor(outputs: unknown[]) {
    this.outputs = outputs.map((value) => typeof value === "string" ? value : JSON.stringify(value));
  }

  async run(): Promise<{ stdout: string }> {
    const stdout = this.outputs.shift();
    if (stdout === undefined) throw new Error("unexpected process call");
    return { stdout };
  }
}

function processWith(overrides: { variables?: unknown; app?: unknown } = {}): ScriptedProcess {
  return new ScriptedProcess([
    { nameWithOwner: "acme/widgets" },
    { id: 42 },
    { id: "PR_kwDOA", number: 229, headRefOid: HEAD_SHA },
    overrides.variables ?? [{ name: "ARC_REVIEW_GATE_APP_ID", value: "15368" }],
    overrides.app ?? { login: "arc-review-gate[bot]" },
    "developer-token\n",
  ]);
}

describe("local review context", () => {
  it("resolves one explicit PR reference into the complete launcher context", async () => {
    await expect(resolveLocalReviewContext({
      hostRef: "github:acme/widgets/pull/229",
      appBotUserId: "302312524",
      process: processWith(),
    })).resolves.toEqual({
      repositoryRef: "acme/widgets",
      owner: "acme",
      repo: "widgets",
      repositoryId: 42,
      pullRequestNumber: 229,
      changeRequestId: "PR_kwDOA",
      headSha: HEAD_SHA,
      appSlug: "arc-review-gate",
      expectedAppId: "15368",
      token: "developer-token",
    });
  });

  it("rejects a missing repository App id variable at its source path", async () => {
    await expect(resolveLocalReviewContext({
      hostRef: "229",
      appBotUserId: "302312524",
      process: processWith({ variables: [] }),
    })).rejects.toThrow("reviewContext.variables.ARC_REVIEW_GATE_APP_ID: missing variable");
  });

  it("rejects an identity that is not a GitHub App bot login", async () => {
    await expect(resolveLocalReviewContext({
      hostRef: "229",
      appBotUserId: "302312524",
      process: processWith({ app: { login: "arc-review-gate" } }),
    })).rejects.toThrow("reviewContext.app.login: expected a [bot] login");
  });
});
