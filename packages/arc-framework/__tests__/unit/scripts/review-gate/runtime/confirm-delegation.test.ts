import { describe, expect, it, vi } from "vitest";

import type {
  ReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import {
  createReviewTarget,
} from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type {
  LocalPrepareDependencies,
} from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

const confirmTarget = vi.fn();
const operationStore = { readOperation: vi.fn() };

vi.mock(
  "../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js",
  () => ({
    createLocalPrepareDependencies: (): LocalPrepareDependencies => ({
      confirmTarget,
      operationStore,
    } as unknown as LocalPrepareDependencies),
  }),
);

const { createLocalAttestDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/local-attest-composition.js"
);
const { createLocalResumeDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/local-resume-composition.js"
);
const { createRespondDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/respond-composition.js"
);
const { createReduceDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/reduce-composition.js"
);

const boundary = { exec: vi.fn(), cwd: "/repo" } as never;

function target(kind: "change-set" | "delivery-member"): ReviewTarget {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind,
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  });
}

describe("target confirmation delegated to preparation", () => {
  const kinds = ["change-set", "delivery-member"] as const;

  it.each(kinds)("routes attest, resume, and respond through prepare for a %s target", async (
    kind,
  ) => {
    const attempted = target(kind);
    const confirmation = { state: "current", target: attempted };
    confirmTarget.mockReset().mockResolvedValue(confirmation);

    for (const create of [
      createLocalAttestDependencies,
      createLocalResumeDependencies,
      createRespondDependencies,
    ]) {
      await expect(create(boundary).confirmTarget(attempted)).resolves.toBe(confirmation);
    }

    expect(confirmTarget.mock.calls).toEqual([[attempted], [attempted], [attempted]]);
  });

  it.each(kinds)("routes reduction through prepare for a %s target", async (kind) => {
    const attempted = target(kind);
    confirmTarget.mockReset().mockRejectedValue(new Error("confirmation reached"));
    operationStore.readOperation.mockResolvedValue({
      version: 1,
      state: {
        kind: "local-review",
        operationId: "operation-1",
        targetId: attempted.targetId,
        target: attempted,
      },
    });

    await expect(createReduceDependencies(boundary).reductionPort.reduce("operation-1"))
      .rejects.toThrow("confirmation reached");
    expect(confirmTarget).toHaveBeenCalledExactlyOnceWith(attempted);
  });
});
