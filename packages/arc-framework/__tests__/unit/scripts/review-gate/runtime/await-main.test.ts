import { describe, expect, it } from "vitest";

import type { AwaitClock, AwaitHostPort } from "../../../../../src/scripts/review-gate/runtime/await.js";
import { parseAwaitArguments, runAwaitMain } from "../../../../../src/scripts/review-gate/runtime/await-main.js";

const HEAD = "a".repeat(40);
const clock: AwaitClock = { now: () => 0, sleep: async () => undefined };
const host: AwaitHostPort = {
  readPullRequestHead: async () => ({ kind: "ok", value: HEAD }),
  readCiState: async () => ({ kind: "ok", value: "success" }),
  readReviewState: async () => ({ kind: "ok", value: { conclusion: "success", blockerCodes: [], ledgerVersion: 1, receiptRefs: [] } }),
};

describe("await launcher contract", () => {
  it("parses kind, exact head, interval, and timeout", () => {
    expect(parseAwaitArguments(["review", "--head", HEAD, "--interval-ms", "30000", "--timeout-ms", "600000"]))
      .toEqual({ kind: "review", expectedHeadSha: HEAD, intervalMs: 30_000, timeoutMs: 600_000 });
    expect(() => parseAwaitArguments(["review", "--head", "main"])).toThrow("usage:");
  });

  it("writes transition and terminal JSON only through the injected output", async () => {
    const lines: string[] = [];
    await expect(runAwaitMain({
      args: ["ci", "--head", HEAD, "--interval-ms", "1000", "--timeout-ms", "5000"],
      repositoryRef: "owner/repo",
      pullRequestNumber: 7,
      host,
      clock,
      write: (line) => { lines.push(line); },
    })).resolves.toMatchObject({ kind: "success" });
    expect(lines.map((line) => JSON.parse(line) as { type: string }).map((value) => value.type))
      .toEqual(["transition", "terminal"]);
  });
});
