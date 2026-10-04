import { describe, expect, it } from "vitest";

import { createHostedHandleFixture } from "../../fixtures/hosted-review.js";
import { handleReviewHostedAwait } from "../../../src/handlers/review.js";
import { hostedLaneAttemptId } from "../../../src/scripts/review-gate/hosted/request.js";

describe("hosted await public terminal contract", () => {
  it.each(["missing", "source", "outcome", "producer"])(
    "refuses terminal output with a %s attempt mismatch",
    async (mismatch) => {
      const handle = createHostedHandleFixture();
      const attempt = {
        sourceId: mismatch === "source" ? "codex-pr" : handle.provider,
        outcome: mismatch === "outcome" ? "findings" : "clean",
        reviewOperationId: mismatch === "producer" ? `sha256:${"0".repeat(64)}` : hostedLaneAttemptId(handle),
      };
      const output: string[] = [];
      const exitCodes: number[] = [];

      await handleReviewHostedAwait("-", {
        readText: async () => JSON.stringify({ schemaVersion: 1, handle }),
        awaitResult: async () => ({
          schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
          reviewUrl: "https://example.invalid/review",
          ...(mismatch === "missing" ? {} : { attempt }),
        }),
        write: (text) => output.push(text), setExitCode: (code) => exitCodes.push(code),
      });

      expect(exitCodes).toEqual([1]);
      expect(JSON.parse(output.join(""))).toMatchObject({
        mode: "review-hosted-await", error: { code: "unexpected-failure" },
      });
    },
  );
});
