import { describe, expect, it } from "vitest";

import { createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  BoundFrontlineResponseBindingSchema,
  frontlineResponseBindingMatchesTarget,
} from
  "../../../../../src/scripts/review-gate/core/frontline-response-binding.js";

const objectId = (character: string): string => character.repeat(40);

function target(kind: "change-set" | "delivery-member", head: string) {
  return createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind,
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: objectId("a"),
    diffBaseTree: objectId("b"),
    headSha: objectId(head),
    headTree: objectId(head),
  });
}

describe("frontline response binding", () => {
  it("rejects a reviewed outcome target that is not the bound private member", () => {
    const binding = BoundFrontlineResponseBindingSchema.parse({
      candidate: {
        workUnit: "example",
        candidateId: `sha256:${"c".repeat(64)}`,
        target: target("change-set", "c"),
      },
      deliveryMember: {
        kind: "delivery-member" as const,
        planId: "123e4567-e89b-42d3-a456-426614174000",
        deliverableId: `sha256:${"d".repeat(64)}`,
        workUnitId: "example",
        head: objectId("d"),
      },
    });

    expect(frontlineResponseBindingMatchesTarget(target("delivery-member", "d"), binding)).toBe(true);
    expect(frontlineResponseBindingMatchesTarget(target("delivery-member", "e"), binding)).toBe(false);
    expect(frontlineResponseBindingMatchesTarget(target("change-set", "d"), binding)).toBe(false);
  });
});
