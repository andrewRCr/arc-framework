import { describe, expect, it } from "vitest";

import {
  LocalReviewSourceSchema,
  createLocalReviewSource,
} from "../../../../../src/scripts/review-gate/core/local-review-source.js";

const semanticFields = {
  schemaVersion: 1,
  semanticsVersion: "git-object-range/v1",
  repositoryId: "repo-1",
  targetId: `sha256:${"a".repeat(64)}`,
  objectFormat: "sha1",
  diffBaseSha: "b".repeat(40),
  diffBaseTree: "c".repeat(40),
  headSha: "d".repeat(40),
  headTree: "e".repeat(40),
} as const;

describe("local review source descriptor", () => {
  it("binds a strict descriptor to its semantic digest", () => {
    const source = createLocalReviewSource({
      ...semanticFields,
      reachabilityRef: "refs/arc/review/pin-1",
      materializationRef: "/tmp/review-1",
    });

    expect(LocalReviewSourceSchema.parse(source)).toEqual(source);
    expect(source.sourceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(LocalReviewSourceSchema.safeParse({ ...source, extra: true }).success).toBe(false);
    expect(LocalReviewSourceSchema.safeParse({
      ...source,
      headSha: "f".repeat(40),
    }).success).toBe(false);
  });

  it("excludes operational locators from the semantic digest", () => {
    const first = createLocalReviewSource({
      ...semanticFields,
      reachabilityRef: "refs/arc/review/pin-1",
      materializationRef: "/tmp/review-1",
    });
    const relocated = createLocalReviewSource({
      ...semanticFields,
      reachabilityRef: "refs/arc/review/pin-2",
      materializationRef: "/var/tmp/review-2",
    });

    expect(relocated.sourceDigest).toBe(first.sourceDigest);
  });

  it("fixes git-object-range semantics and object-id width", () => {
    const source = createLocalReviewSource({
      ...semanticFields,
      reachabilityRef: "refs/arc/review/pin-1",
      materializationRef: "/tmp/review-1",
    });

    expect(LocalReviewSourceSchema.safeParse({
      ...source,
      semanticsVersion: "git-object-range/v2",
    }).success).toBe(false);
    expect(() => createLocalReviewSource({
      ...semanticFields,
      objectFormat: "sha256",
      reachabilityRef: "refs/arc/review/pin-1",
      materializationRef: "/tmp/review-1",
    })).toThrow(/object format/iu);
  });

  it("binds correction semantics while excluding their operation-owned pins", () => {
    const correctionScope = {
      schemaVersion: 1 as const,
      predecessorProducerId: "hosted/attempt-1",
      predecessorHeadSha: "f".repeat(40),
      basisHeadSha: semanticFields.diffBaseSha,
      headSha: semanticFields.headSha,
      requiredFindingIds: ["F-1"],
    };
    const first = createLocalReviewSource({
      ...semanticFields,
      correctionScope,
      reachabilityRef: "refs/arc/review/local/operation-2",
      predecessorReachabilityRef: "refs/arc/review/local-scope/operation-2/predecessor",
      basisReachabilityRef: "refs/arc/review/local-scope/operation-2/basis",
      materializationRef: "/tmp/review-2",
    });
    const relocated = createLocalReviewSource({
      ...semanticFields,
      correctionScope,
      reachabilityRef: "refs/arc/review/local/operation-3",
      predecessorReachabilityRef: "refs/arc/review/local-scope/operation-3/predecessor",
      basisReachabilityRef: "refs/arc/review/local-scope/operation-3/basis",
      materializationRef: "/tmp/review-3",
    });

    expect(first.correctionScope).toEqual(correctionScope);
    expect(relocated.sourceDigest).toBe(first.sourceDigest);
    expect(LocalReviewSourceSchema.safeParse({
      ...first,
      correctionScope: { ...correctionScope, headSha: "0".repeat(40) },
    }).success).toBe(false);
    expect(LocalReviewSourceSchema.safeParse({
      ...first,
      predecessorReachabilityRef: undefined,
    }).success).toBe(false);
  });
});
