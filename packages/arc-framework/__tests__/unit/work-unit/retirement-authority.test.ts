import { describe, expect, it } from "vitest";

import { contentDigest } from "../../../src/lib/canonical/content-digest.js";
import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import {
  describeTeardownAuthorizationRefusal,
  gitTransitionExpectedLifecycle,
  gitTransitionResultDigest,
  retirementSubjectRefusal,
  worktreeSubjectsEqual,
  type TeardownAuthorizationRefusal,
} from "../../../src/lib/work-unit/retirement-authority.js";

const digest = (value: string) => contentDigest(new TextEncoder().encode(value));

describe("Git transition result digest", () => {
  const draftPath = validateManagedPath(".arc/backlog/planned/sample/draft-sample.md");
  const metaPath = validateManagedPath(".arc/backlog/planned/sample/meta-sample.md");
  const input = {
    transition: "park-planning" as const,
    subject: { kind: "work-unit", name: "sample" } as const,
    branch: "plan/sample",
    retiringHead: "a".repeat(40),
    resultHead: "b".repeat(40),
    resultInventory: [
      { path: metaPath, contentDigest: digest("meta") },
      { path: draftPath, contentDigest: digest("draft") },
    ],
  };

  it("uses one versioned domain-separated vector with a path-sorted result inventory", () => {
    expect(gitTransitionResultDigest(input)).toBe(canonicalDigest({
      domain: "arc.git-transition-result",
      schemaVersion: 1,
      transition: "park-planning",
      subject: input.subject,
      branch: input.branch,
      retiringHead: input.retiringHead,
      resultHead: input.resultHead,
      expectedLifecycle: "planned",
      resultInventory: [
        { path: draftPath, contentDigest: digest("draft") },
        { path: metaPath, contentDigest: digest("meta") },
      ],
    }));
    expect(gitTransitionResultDigest({
      ...input,
      resultInventory: [...input.resultInventory].reverse(),
    })).toBe(gitTransitionResultDigest(input));
  });

  it("sorts non-ASCII paths by their canonical UTF-8 bytes", () => {
    const asciiPath = validateManagedPath(".arc/z.json");
    const nonAsciiPath = validateManagedPath(".arc/é.json");
    const resultInventory = [
      { path: nonAsciiPath, contentDigest: digest("non-ascii") },
      { path: asciiPath, contentDigest: digest("ascii") },
    ];

    expect(gitTransitionResultDigest({ ...input, resultInventory })).toBe(canonicalDigest({
      domain: "arc.git-transition-result",
      schemaVersion: 1,
      transition: "park-planning",
      subject: input.subject,
      branch: input.branch,
      retiringHead: input.retiringHead,
      resultHead: input.resultHead,
      expectedLifecycle: "planned",
      resultInventory: [
        { path: asciiPath, contentDigest: digest("ascii") },
        { path: nonAsciiPath, contentDigest: digest("non-ascii") },
      ],
    }));
  });

  it("changes when any replay-bound transition fact changes", () => {
    const expected = gitTransitionResultDigest(input);
    expect(gitTransitionResultDigest({ ...input, transition: "abandon" })).not.toBe(expected);
    expect(gitTransitionResultDigest({ ...input, branch: "plan/other" })).not.toBe(expected);
    expect(gitTransitionResultDigest({ ...input, retiringHead: "c".repeat(40) })).not.toBe(expected);
    expect(gitTransitionResultDigest({ ...input, resultHead: "d".repeat(40) })).not.toBe(expected);
    expect(gitTransitionResultDigest({ ...input, resultInventory: [] })).not.toBe(expected);
    expect(gitTransitionExpectedLifecycle("abandon")).toBe("nonexistent");
  });
});

const refusalDescriptions = {
  "unsupported-transition": "unsupported transition",
  "evidence-missing": "retirement evidence is missing",
  "evidence-mismatch": "retirement evidence does not match the requested transition",
  "projection-mismatch": "the live branch projection does not match the request",
  "conservation-unproven": "content conservation is not proven",
  "preservation-unproven": "preservation is not proven",
  "authority-unavailable": "retirement authority is unavailable",
  "authority-ambiguous": "retirement authority found conflicting evidence",
  "authority-conflict": "retirement authority changed during the operation",
} as const satisfies Record<TeardownAuthorizationRefusal, string>;

describe("TeardownAuthorizationRefusal", () => {
  it("is handled exhaustively by the runtime renderer", () => {
    for (const [reason, description] of Object.entries(refusalDescriptions)) {
      expect(describeTeardownAuthorizationRefusal(reason as TeardownAuthorizationRefusal)).toBe(description);
    }
  });
});

describe("worktree subject identity", () => {
  it("keeps work-unit, errand, and branch subjects distinct when their text suffixes match", () => {
    const workUnit = { kind: "work-unit", name: "shared" } as const;
    const errand = { kind: "errand", slug: "shared" } as const;
    const branch = { kind: "branch", ref: "shared" } as const;

    expect(worktreeSubjectsEqual(workUnit, workUnit)).toBe(true);
    expect(worktreeSubjectsEqual(workUnit, errand)).toBe(false);
    expect(worktreeSubjectsEqual(workUnit, branch)).toBe(false);
    expect(worktreeSubjectsEqual(errand, branch)).toBe(false);
  });

  it("refuses the reserved errand subject until an errand retirement driver exists", () => {
    expect(retirementSubjectRefusal({ kind: "errand", slug: "shared" })).toBe("unsupported-transition");
    expect(retirementSubjectRefusal({ kind: "work-unit", name: "shared" })).toBeNull();
    expect(retirementSubjectRefusal({ kind: "branch", ref: "chore/shared" })).toBeNull();
  });
});
