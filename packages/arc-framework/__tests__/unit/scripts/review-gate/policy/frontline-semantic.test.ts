import { describe, expect, it, vi } from "vitest";

import {
  FRONTLINE_BINDING_REMEDY,
  FRONTLINE_REVIEW_PROMPT,
  FrontlineSemanticRecordSchema,
  resolveFrontlineReview,
} from "../../../../../src/scripts/review-gate/policy/frontline-semantic.js";
import {
  FrontlineSourceRegistry,
  type FrontlineSourcePreferenceReader,
} from "../../../../../src/scripts/review-gate/policy/frontline-source.js";

function preferences(input: {
  developer?: string | null;
  project?: string | null;
} = {}): FrontlineSourcePreferenceReader {
  return {
    readDeveloperSourceIds: vi.fn().mockResolvedValue(input.developer === undefined || input.developer === null
      ? []
      : [input.developer]),
    readProjectSourceIds: vi.fn().mockResolvedValue(input.project === undefined || input.project === null
      ? []
      : [input.project]),
  };
}

const registry = new FrontlineSourceRegistry([
  {
    sourceId: "fresh-agent",
    descriptor: { kind: "agent", handle: { capabilityId: "independent-review" } },
  },
]);

describe("frontline semantic resolution", () => {
  it("emits a versioned skip invariant without reading source preferences", async () => {
    const reader = preferences({ developer: "fresh-agent" });

    await expect(resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      invocation: { mode: "skip" },
      preferences: reader,
      registry,
    })).resolves.toEqual({
      frontlineReview: {
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        action: "skip",
        reasons: ["frontline-policy-attempt", "invocation-skip"],
        source: null,
        maxPasses: 0,
        promptText: null,
      },
      diagnostics: [],
    });
    expect(reader.readDeveloperSourceIds).not.toHaveBeenCalled();
    expect(reader.readProjectSourceIds).not.toHaveBeenCalled();
  });

  it("selects a source for attempt and caps the default at two passes", async () => {
    await expect(resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      preferences: preferences({ developer: "fresh-agent" }),
      registry,
    })).resolves.toEqual({
      frontlineReview: {
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        action: "attempt",
        reasons: ["frontline-policy-attempt", "source-developer"],
        source: {
          sourceId: "fresh-agent",
          kind: "agent",
          handle: { capabilityId: "independent-review" },
        },
        maxPasses: 2,
        promptText: FRONTLINE_REVIEW_PROMPT,
      },
      diagnostics: [],
    });
  });

  it("allows projects to reduce the pass allowance to one", async () => {
    const result = await resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      invocation: { mode: "force", sourceId: "fresh-agent" },
      preferences: preferences(),
      registry,
      maxPasses: 1,
    });

    expect(result.frontlineReview).toMatchObject({ action: "attempt", maxPasses: 1 });
    expect(result.frontlineReview.reasons).toEqual([
      "frontline-policy-attempt",
      "invocation-force",
      "source-invocation",
    ]);
  });

  it("downgrades a source-less attempt to an actionable offer", async () => {
    await expect(resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      preferences: preferences(),
      registry,
    })).resolves.toEqual({
      frontlineReview: {
        schemaVersion: 1,
        semanticsVersion: "frontline-review/v1",
        action: "offer",
        reasons: ["frontline-policy-attempt", "source-unbound"],
        source: null,
        maxPasses: 2,
        promptText: FRONTLINE_BINDING_REMEDY,
      },
      diagnostics: [],
    });
  });

  it("preserves an offered action and its selected source", async () => {
    const result = await resolveFrontlineReview({
      methodActive: true,
      routerAction: "offer",
      invocation: { mode: "inherit", sourceId: "fresh-agent" },
      preferences: preferences(),
      registry,
    });

    expect(result.frontlineReview).toMatchObject({
      action: "offer",
      maxPasses: 2,
      promptText: FRONTLINE_REVIEW_PROMPT,
      source: { sourceId: "fresh-agent" },
    });
  });

  it("retains source diagnostics while emitting the unbound remedy", async () => {
    const result = await resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      preferences: preferences({ developer: "missing-source" }),
      registry,
    });

    expect(result.frontlineReview).toMatchObject({
      action: "offer",
      reasons: ["frontline-policy-attempt", "source-unbound"],
      source: null,
      promptText: FRONTLINE_BINDING_REMEDY,
    });
    expect(result.diagnostics).toEqual([
      { code: "unregistered-source-id", tier: "developer", sourceId: "missing-source" },
    ]);
  });

  it("accepts a positive safe-integer pass allowance beyond two", async () => {
    await expect(resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      preferences: preferences(),
      registry,
      maxPasses: 3,
    })).resolves.toMatchObject({ frontlineReview: { maxPasses: 3 } });
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid pass allowance of %s",
    async (maxPasses) => {
    await expect(resolveFrontlineReview({
      methodActive: true,
      routerAction: "attempt",
      preferences: preferences(),
      registry,
      maxPasses,
    })).rejects.toThrow();
    },
  );

  it("rejects records that violate skip or attempt invariants", () => {
    const base = {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      reasons: ["frontline-policy-attempt"],
    } as const;

    expect(() => FrontlineSemanticRecordSchema.parse({
      ...base,
      action: "skip",
      source: null,
      maxPasses: 1,
      promptText: null,
    })).toThrow(/skip requires/iu);
    expect(() => FrontlineSemanticRecordSchema.parse({
      ...base,
      action: "attempt",
      source: null,
      maxPasses: 2,
      promptText: FRONTLINE_REVIEW_PROMPT,
    })).toThrow(/attempt requires/iu);
  });
});
