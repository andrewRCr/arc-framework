/** Thin CLI boundary for exact-effect Errand merge requests. */

import { describe, expect, it } from "vitest";

import {
  formatErrandMergeResult,
  handleErrandMerge,
  type ErrandMergeHandlerDependencies,
} from "../../../src/handlers/errand-merge.js";
import { ErrandMergeRequestSchema } from "../../../src/scripts/integration/errand-merge.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const request = ErrandMergeRequestSchema.parse({
  schemaVersion: 1,
  identity: {
    slug: "example",
    claimId: "1234567890abcdef1234567890abcdef",
    branch: "chore/example",
    generation: "errand-v1/example/1234567890abcdef1234567890abcdef",
  },
  approvedTarget: {
    repository: "owner/repo",
    pullRequest: 42,
    baseRef: "main",
    headRef: "chore/example",
    headSha: oid("c"),
  },
  lane: "reviewed",
  mergeMethod: { method: "merge", policyFingerprint: digest("d") },
});
const merged = {
  schemaVersion: 1 as const,
  mode: "errand-merge" as const,
  state: "merged" as const,
  nextAction: "complete" as const,
  identity: request.identity,
  approvedTarget: request.approvedTarget,
  lane: request.lane,
  providerMergeId: "merge-123",
};

function dependencies(): {
  readonly value: ErrandMergeHandlerDependencies;
  readonly output: string[];
  readonly exitCodes: number[];
} {
  const output: string[] = [];
  const exitCodes: number[] = [];
  return {
    output,
    exitCodes,
    value: {
      readText: async () => JSON.stringify(request),
      resolveRoot: () => "/repo",
      resolveIdentity: async () => "andrew",
      merge: async () => merged,
      write: (text) => { output.push(text); },
      setExitCode: (code) => { exitCodes.push(code); },
    },
  };
}

describe("Errand merge handler", () => {
  it("passes valid JSON through the typed operation and preserves its result", async () => {
    const { value, output, exitCodes } = dependencies();

    await handleErrandMerge("example", "-", { json: true }, undefined, value);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toEqual(merged);
    expect(exitCodes).toEqual([0]);
  });

  it.each([
    [
      { ...request, identity: { ...request.identity, generation: `errand-v1/example/${"f".repeat(32)}` } },
      "Errand generation",
    ],
    [
      { ...request, approvedTarget: { ...request.approvedTarget, headRef: "chore/other" } },
      "Approved target",
    ],
    [{ ...request, lane: "native-auto-merge" }, "Invalid option"],
  ])("returns a typed refusal for invalid exact request input", async (invalid, detail) => {
    const { value, output, exitCodes } = dependencies();
    const invalidDependencies = {
      ...value,
      readText: async () => JSON.stringify(invalid),
      merge: async () => { throw new Error("Invalid input reached the merge operation."); },
    };

    await handleErrandMerge("example", "-", { json: true }, undefined, invalidDependencies);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      state: "refused",
      nextAction: "stop",
      reason: "invalid-input",
      detail: expect.stringContaining(detail),
    });
    expect(exitCodes).toEqual([64]);
  });

  it("preserves adapter failure detail in the typed command result", async () => {
    const { value, output, exitCodes } = dependencies();
    const failingDependencies = {
      ...value,
      merge: async () => { throw new Error("The provider adapter returned malformed coordinates."); },
    };

    await handleErrandMerge("example", "-", { json: true }, undefined, failingDependencies);

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? "null") as unknown).toMatchObject({
      state: "operation-failed",
      nextAction: "retry",
      reason: "provider-operation-failed",
      detail: "The provider adapter returned malformed coordinates.",
    });
    expect(exitCodes).toEqual([1]);
  });

  it("renders operation-authored detail, next action, and exact remedy argv", () => {
    const result = {
      ...merged,
      state: "operation-failed" as const,
      nextAction: "retry" as const,
      reason: "provider-operation-failed" as const,
      detail: "The provider was temporarily unavailable.",
      coordinates: { observedTarget: request.approvedTarget, observedBaseOid: oid("b") },
      continuation: {
        kind: "remedy" as const,
        remedy: {
          invariant: "The exact request remains retryable.",
          text: "Retry the exact request.",
          argv: ["arc", "errand", "merge", "example", "-", "--json"],
          stdin: request,
        },
      },
    };

    expect(formatErrandMergeResult(result, false)).toEqual({
      stream: "stderr",
      text: [
        "operation-failed: The provider was temporarily unavailable.",
        "Next: retry",
        `Run: printf '%s\\n' '${JSON.stringify(request)}' | arc errand merge example - --json`,
      ].join("\n"),
      exitCode: 1,
    });
  });
});
