import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { createHostedHandleFixture } from "../../fixtures/hosted-review.js";
import { handleReviewHostedAwait } from "../../../src/handlers/review.js";
import { hostedLaneAttemptId } from "../../../src/scripts/review-gate/hosted/request.js";
import { createRegistry } from "../../../src/lib/kernel/index.js";
import { registerReviewCommandEnvelopeSchemas } from
  "../../../src/scripts/review-gate/core/review-command-envelope-registry.js";
import { HostedAwaitCommandResultSchema, HostedAwaitResultSchema } from
  "../../../src/scripts/review-gate/hosted/await.js";
import type { ReviewAttempt } from
  "../../../src/scripts/review-gate/policy/review-policy-attempt.js";

describe("hosted await public terminal contract", () => {
  it.each(["clean", "findings"])("requires an attempt in the published %s schema", (state) => {
    const registered = registerReviewCommandEnvelopeSchemas(createRegistry())
      .get("review-hosted-await-envelope");
    if (registered === undefined) throw new Error("hosted await envelope is not registered");
    const schema = z.toJSONSchema(registered);
    const branch = schema.anyOf?.find((candidate) => {
      const discriminator = candidate.properties?.state;
      return typeof discriminator === "object" && discriminator.const === state;
    });
    expect(branch?.required).toContain("attempt");
  });

  it("exposes terminal attempts as required to typed consumers", () => {
    type Terminal = Extract<z.infer<typeof HostedAwaitCommandResultSchema>, { state: "clean" | "findings" }>;
    expectTypeOf<Terminal["attempt"]>().toEqualTypeOf<ReviewAttempt>();
  });

  it("keeps raw observations valid before their producer is sealed", () => {
    const observed = {
      schemaVersion: 1, mode: "review-hosted-await", handle: createHostedHandleFixture(),
      state: "clean", nextAction: "complete", reviewUrl: "https://example.invalid/review",
    };
    expect(HostedAwaitResultSchema.safeParse(observed).success).toBe(true);
    expect(HostedAwaitCommandResultSchema.safeParse(observed).success).toBe(false);
  });

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
