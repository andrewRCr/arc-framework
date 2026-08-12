/** Contract tests for repository lifecycle-contribution path resolution and comparison. */

import { describe, expect, it } from "vitest";

import { validateManagedPath } from "../../../src/lib/kernel/index.js";
import {
  compareDeliveryLifecycleContribution,
  compareNormalizedDeliveryTree,
  CurrentDeliveryLifecycleContributionPathSource,
} from "../../../src/lib/delivery/lifecycle-contribution.js";

describe("CurrentDeliveryLifecycleContributionPathSource", () => {
  it("resolves the current work-unit artifact group and shared readiness projection", async () => {
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
      workUnitArtifacts: [
        ".arc/active/evidence-example.md",
        ".arc/active/meta-example.md",
        ".arc/active/notes-example.md",
        ".arc/active/spec-example.md",
        ".arc/active/tasks-example.md",
      ],
      sharedProjections: [".arc/backlog/ROADMAP.md"],
    });
  });

  it("omits projections materialized outside the code repository", async () => {
    const source = new CurrentDeliveryLifecycleContributionPathSource({
      readDirectory: async () => ["meta-example.md"],
      projectReadinessPath: null,
    });

    await expect(source.resolve({
      workUnitId: "example",
      activeMetaPath: validateManagedPath(".arc/active/meta-example.md"),
    })).resolves.toEqual({
      workUnitArtifacts: [".arc/active/meta-example.md"],
      sharedProjections: [],
    });
  });
});

describe("compareNormalizedDeliveryTree", () => {
  it("reports dropped, invented, and mismatched entries distinctly after lifecycle normalization", () => {
    const blob = (oid: string) => ({ mode: "100644", type: "blob", oid });
    const protectedBase = new Map([["lifecycle.md", blob("base")]]);
    const control = new Map([
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
      control,
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
