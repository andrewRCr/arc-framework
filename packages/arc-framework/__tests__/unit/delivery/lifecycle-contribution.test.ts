/** Contract tests for repository lifecycle-contribution path resolution and comparison. */

import { describe, expect, it } from "vitest";

import { validateManagedPath } from "../../../src/lib/kernel/index.js";
import {
  classifyDeliveryTerminalDelta,
  compareDeliveryLifecycleContribution,
  compareNormalizedDeliveryTree,
  CurrentDeliveryLifecycleContributionPathSource,
} from "../../../src/lib/delivery/lifecycle-contribution.js";

describe("CurrentDeliveryLifecycleContributionPathSource", () => {
  it("resolves the complete lifecycle group including machine-owned Candidate records", async () => {
    const source = new CurrentDeliveryLifecycleContributionPathSource({
      readDirectory: async () => [
        "tasks-example.md",
        "meta-other.md",
        "notes-example.md",
        "spec-example.md",
        "evidence-example.md",
        "meta-example.md",
      ],
      projectReadinessPath: validateManagedPath(".arc/backlog/ROADMAP.md"),
    });

    await expect(source.resolve({
      workUnitId: "example",
      activeMetaPath: validateManagedPath(".arc/active/meta-example.md"),
    })).resolves.toEqual({
      paths: [
        ".arc/active/evidence-example.md",
        ".arc/active/meta-example.md",
        ".arc/active/notes-example.md",
        ".arc/active/spec-example.md",
        ".arc/active/tasks-example.md",
        ".arc/backlog/ROADMAP.md",
        ".arc/system/.internal/candidates/example.boundary.json",
        ".arc/system/.internal/candidates/example.json",
      ],
    });
  });

  it("retains predecessor-locus artifacts from the protected base", async () => {
    const source = new CurrentDeliveryLifecycleContributionPathSource({
      readDirectory: async () => ["meta-example.md", "spec-example.md", "tasks-example.md"],
      readArtifactsAtRef: async (ref) => ref === "refs/heads/main"
        ? [
            validateManagedPath(".arc/backlog/planned/cohort/example/draft-example.md"),
            validateManagedPath(".arc/backlog/planned/cohort/example/meta-example.md"),
          ]
        : [
            validateManagedPath(".arc/active/meta-example.md"),
            validateManagedPath(".arc/active/spec-example.md"),
            validateManagedPath(".arc/active/tasks-example.md"),
          ],
      projectReadinessPath: validateManagedPath(".arc/backlog/ROADMAP.md"),
    });

    await expect(source.resolve({
      workUnitId: "example",
      activeMetaPath: validateManagedPath(".arc/active/meta-example.md"),
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/feat/example",
    })).resolves.toEqual({
      paths: [
        ".arc/active/meta-example.md",
        ".arc/active/spec-example.md",
        ".arc/active/tasks-example.md",
        ".arc/backlog/ROADMAP.md",
        ".arc/backlog/planned/cohort/example/draft-example.md",
        ".arc/backlog/planned/cohort/example/meta-example.md",
        ".arc/system/.internal/candidates/example.boundary.json",
        ".arc/system/.internal/candidates/example.json",
      ],
    });
  });

  it("omits readiness projections materialized outside the code repository", async () => {
    const source = new CurrentDeliveryLifecycleContributionPathSource({
      readDirectory: async () => ["meta-example.md"],
      projectReadinessPath: null,
    });

    await expect(source.resolve({
      workUnitId: "example",
      activeMetaPath: validateManagedPath(".arc/active/meta-example.md"),
    })).resolves.toEqual({
      paths: [
        ".arc/active/meta-example.md",
        ".arc/system/.internal/candidates/example.boundary.json",
        ".arc/system/.internal/candidates/example.json",
      ],
    });
  });
});

describe("compareNormalizedDeliveryTree", () => {
  it("matches when the candidate equals the lifecycle-normalized top tree", () => {
    const blob = (oid: string) => ({ mode: "100644", type: "blob", oid });
    const protectedBase = new Map([["lifecycle.md", blob("base")]]);
    const top = new Map([
      ["kept.md", blob("same")],
      ["lifecycle.md", blob("control")],
    ]);
    const finalCandidate = new Map([
      ["kept.md", blob("same")],
      ["lifecycle.md", blob("base")],
    ]);

    expect(compareNormalizedDeliveryTree({
      protectedBase,
      top,
      finalCandidate,
      lifecyclePaths: ["lifecycle.md"],
    })).toEqual({ status: "match" });
  });

  it("reports a lifecycle path absent on the base but retained by the candidate as invented", () => {
    const blob = (oid: string) => ({ mode: "100644", type: "blob", oid });
    const lifecycleEntry = blob("control");

    expect(compareNormalizedDeliveryTree({
      protectedBase: new Map(),
      top: new Map([["lifecycle.md", lifecycleEntry]]),
      finalCandidate: new Map([["lifecycle.md", lifecycleEntry]]),
      lifecyclePaths: ["lifecycle.md"],
    })).toEqual({
      status: "mismatch",
      droppedPaths: [],
      inventedPaths: ["lifecycle.md"],
      mismatchedPaths: [],
    });
  });

  it("reports dropped, invented, and mismatched entries distinctly after lifecycle normalization", () => {
    const blob = (oid: string) => ({ mode: "100644", type: "blob", oid });
    const protectedBase = new Map([["lifecycle.md", blob("base")]]);
    const top = new Map([
      ["kept.md", blob("same")],
      ["dropped.md", blob("drop")],
      ["mismatched.md", blob("expected")],
      ["lifecycle.md", blob("control")],
    ]);
    const finalCandidate = new Map([
      ["kept.md", blob("same")],
      ["invented.md", blob("invent")],
      ["mismatched.md", blob("actual")],
      ["lifecycle.md", blob("base")],
    ]);

    expect(compareNormalizedDeliveryTree({
      protectedBase,
      top,
      finalCandidate,
      lifecyclePaths: ["lifecycle.md"],
    })).toEqual({
      status: "mismatch",
      droppedPaths: ["dropped.md"],
      inventedPaths: ["invented.md"],
      mismatchedPaths: ["mismatched.md"],
    });
  });
});

describe("compareDeliveryLifecycleContribution", () => {
  it("names every added, changed, deleted, mode-changed, and type-changed supplied path", () => {
    const blob = (oid: string, mode = "100644") => ({ mode, type: "blob", oid });
    const protectedBase = new Map([
      ["added.md", null],
      ["changed.md", blob("a")],
      ["deleted.md", blob("a")],
      ["mode.md", blob("a")],
      ["type.md", blob("a")],
      ["unrelated.md", blob("a")],
    ]);
    const candidate = new Map([
      ["added.md", blob("a")],
      ["changed.md", blob("b")],
      ["deleted.md", null],
      ["mode.md", blob("a", "100755")],
      ["type.md", { mode: "160000", type: "commit", oid: "a" }],
      ["unrelated.md", blob("b")],
    ]);

    expect(compareDeliveryLifecycleContribution({
      paths: ["type.md", "mode.md", "deleted.md", "changed.md", "added.md"],
      protectedBase,
      candidate,
    })).toEqual({
      status: "mismatch",
      mismatchedPaths: ["added.md", "changed.md", "deleted.md", "mode.md", "type.md"],
    });
  });
});

describe("classifyDeliveryTerminalDelta", () => {
  it("classifies a delta reaching only lifecycle paths as lifecycle-only", () => {
    expect(classifyDeliveryTerminalDelta({
      changedPaths: [".arc/active/tasks-example.md", ".arc/active/meta-example.md"],
      lifecyclePaths: [
        ".arc/active/meta-example.md",
        ".arc/active/spec-example.md",
        ".arc/active/tasks-example.md",
      ],
    })).toEqual({
      kind: "lifecycle-only",
      lifecyclePaths: [".arc/active/meta-example.md", ".arc/active/tasks-example.md"],
    });
  });

  it("partitions a delta that also reaches content outside the lifecycle group", () => {
    expect(classifyDeliveryTerminalDelta({
      changedPaths: [
        "packages/arc-framework/src/lib/delivery/review-fix.ts",
        ".arc/active/tasks-example.md",
        "packages/arc-framework/__tests__/unit/delivery/review-fix.test.ts",
      ],
      lifecyclePaths: [".arc/active/meta-example.md", ".arc/active/tasks-example.md"],
    })).toEqual({
      kind: "carries-non-lifecycle",
      lifecyclePaths: [".arc/active/tasks-example.md"],
      nonLifecyclePaths: [
        "packages/arc-framework/__tests__/unit/delivery/review-fix.test.ts",
        "packages/arc-framework/src/lib/delivery/review-fix.ts",
      ],
    });
  });

  it("treats an empty delta as lifecycle-only without inventing paths", () => {
    expect(classifyDeliveryTerminalDelta({
      changedPaths: [],
      lifecyclePaths: [".arc/active/meta-example.md"],
    })).toEqual({ kind: "lifecycle-only", lifecyclePaths: [] });
  });

  it("deduplicates changed paths and reports them in stable byte order", () => {
    expect(classifyDeliveryTerminalDelta({
      changedPaths: ["b.ts", "a.md", "b.ts", "a.md"],
      lifecyclePaths: ["a.md", "a.md"],
    })).toEqual({
      kind: "carries-non-lifecycle",
      lifecyclePaths: ["a.md"],
      nonLifecyclePaths: ["b.ts"],
    });
  });

  it("classifies a delta with no lifecycle paths supplied as fully non-lifecycle", () => {
    expect(classifyDeliveryTerminalDelta({
      changedPaths: [".arc/active/meta-example.md"],
      lifecyclePaths: [],
    })).toEqual({
      kind: "carries-non-lifecycle",
      lifecyclePaths: [],
      nonLifecyclePaths: [".arc/active/meta-example.md"],
    });
  });
});
