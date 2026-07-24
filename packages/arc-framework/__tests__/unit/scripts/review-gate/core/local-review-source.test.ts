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
});
