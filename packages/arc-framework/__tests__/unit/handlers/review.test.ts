import { describe, expect, it, vi } from "vitest";

import { handleReviewLocalPrepare } from "../../../src/handlers/review.js";
import { LocalTargetDerivationError } from "../../../src/scripts/review-gate/hosts/local/repository-target.js";

describe("handleReviewLocalPrepare", () => {
  it("reads one request and emits one validated success envelope", async () => {
    const write = vi.fn();
    const prepare = vi.fn(async () => ({
      schemaVersion: 1,
      mode: "review-local-prepare",
      diagnostics: [],
      state: "exempt",
      nextAction: "none",
      payload: {},
    }));

    await handleReviewLocalPrepare("-", {
      resolveRoot: () => "/repo",
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        evaluatorIdentity: "reviewer",
        routingFacts: {},
      }),
      prepare,
      write,
      setExitCode: vi.fn(),
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(
      "{\"schemaVersion\":1,\"diagnostics\":[],\"mode\":\"review-local-prepare\","
      + "\"state\":\"exempt\",\"nextAction\":\"none\",\"payload\":{}}\n",
    );
  });

  it("emits a typed invalid-input envelope for repository preconditions", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleReviewLocalPrepare("request.json", {
      resolveRoot: () => "/repo",
      readText: async () => "{}",
      prepare: async () => {
        throw new LocalTargetDerivationError("dirty-worktree");
      },
      write,
      setExitCode,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      schemaVersion: 1,
      diagnostics: [{
        code: "repository-precondition",
        message: "dirty-worktree",
        precondition: "clean-worktree",
      }],
      mode: "review-local-prepare",
      error: {
        code: "invalid-input",
        message: "dirty-worktree",
      },
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
