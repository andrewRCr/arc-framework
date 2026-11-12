/** The projected roots agree with the layout's resolved paths, in both their per-identity and pattern forms. */
import { posix } from "node:path";
import { describe, expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { resolveArcPath } from "../../../src/lib/layout/projection.js";
import {
  PROJECTED_LIFECYCLE_ROOTS, projectedRootPaths, projectedRootPatterns,
} from "../../../src/lib/layout/projected-roots.js";

const identity = SlugSchema.parse("andrew");

describe("projected roots", () => {
  it("names each shared root at the path the layout resolves for it", () => {
    const backlogParents = new Set([
      posix.dirname(resolveArcPath({ kind: "placement-root", tier: "planned" })),
      posix.dirname(resolveArcPath({ kind: "placement-root", tier: "provisional" })),
      posix.dirname(resolveArcPath({ kind: "inbox", scope: { kind: "project" } })),
    ]);
    expect(backlogParents.size).toBe(1);
    expect(PROJECTED_LIFECYCLE_ROOTS).toEqual([
      resolveArcPath({ kind: "placement-root", tier: "active" }),
      ...backlogParents,
      resolveArcPath({ kind: "placement-root", tier: "completed" }),
    ]);
  });

  it("adds an identity's personal root at its user-root path, ignored for every identity by one pattern", () => {
    expect(projectedRootPaths(identity)).toEqual([
      ...PROJECTED_LIFECYCLE_ROOTS, resolveArcPath({ kind: "user-root", identity }),
    ]);
    expect(projectedRootPatterns()).toEqual([...PROJECTED_LIFECYCLE_ROOTS.map((root) => `${root}/`), ".arc/user/*/"]);
  });
});
