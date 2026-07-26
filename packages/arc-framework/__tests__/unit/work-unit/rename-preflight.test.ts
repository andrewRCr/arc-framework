import { describe, expect, it } from "vitest";

import type { ComposedLifecycleIndexResult } from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import type { LifecycleIndex, LifecycleIndexEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import {
  assertRenameCollisionFree,
  assertRenameExecutionLocus,
  assertRenameSubjectPreconditions,
  resolveRenameSubject,
  validateRenameRequest,
} from "../../../src/lib/work-unit/rename-preflight.js";

function entry(slug: string, location: LifecycleIndexEntry["location"] = "active"): LifecycleIndexEntry {
  return {
    slug,
    phase: location === "completed" ? "Shipped" : "Active",
    location,
    cohort: null,
    dependsOn: [],
    path: `.arc/${location}/meta-${slug}.md`,
  };
}

function index(...entries: LifecycleIndexEntry[]): LifecycleIndex {
  return new Map(entries.map((value) => [value.slug, value]));
}

function composed(
  lifecycleIndex: LifecycleIndex,
  options: { indeterminate?: string; unreachable?: true } = {},
): ComposedLifecycleIndexResult {
  const bySlug = new Map();
  if (options.indeterminate !== undefined) {
    bySlug.set(options.indeterminate, { marks: ["indeterminate"], warnings: [] });
  }
  return {
    index: lifecycleIndex,
    recordsBySlug: new Map(),
    qualityFacts: {
      warnings: [],
      resultMarks: [],
      bySlug,
      ...(options.unreachable === true ? { unreachable: true as const } : {}),
    },
    worktreePathBySlug: new Map(),
    liveRefs: {},
    reachable: true,
    readQuality: "reachable",
  };
}

describe("resolveRenameSubject", () => {
  it("resolves the old slug before the artifact commit", () => {
    const subject = entry("old-name");
    expect(resolveRenameSubject(index(subject), "old-name", "new-name"))
      .toEqual({ entry: subject, resolvedSlug: "old-name", resuming: false });
  });

  it("resolves the new slug as a resumed run", () => {
    const subject = entry("new-name");
    expect(resolveRenameSubject(index(subject), "old-name", "new-name"))
      .toEqual({ entry: subject, resolvedSlug: "new-name", resuming: true });
  });

  it("refuses when neither slug resolves", () => {
    expect(() => resolveRenameSubject(index(), "old-name", "new-name"))
      .toThrow(/neither.*old-name.*new-name/iu);
  });

  it("refuses when both slugs resolve", () => {
    expect(() => resolveRenameSubject(index(entry("old-name"), entry("new-name")), "old-name", "new-name"))
      .toThrow(/both.*old-name.*new-name/iu);
  });
});

describe("rename request guards", () => {
  it("validates the target slug before subject resolution", () => {
    expect(() => validateRenameRequest("old-name", "../escape")).toThrow(/target slug/iu);
  });

  it("refuses a no-op rename", () => {
    expect(() => validateRenameRequest("old-name", "old-name")).toThrow(/different/iu);
  });

  it("accepts execution from inside the holding worktree", async () => {
    await expect(assertRenameExecutionLocus({
      currentLocus: "/work/project.old-name/packages",
      holdingWorktreePath: "/work/project.old-name",
    })).resolves.toBeUndefined();
  });

  it("refuses execution elsewhere and names the holding worktree", async () => {
    await expect(assertRenameExecutionLocus({
      currentLocus: "/work/primary",
      holdingWorktreePath: "/work/project.old-name",
    })).rejects.toThrow(/project\.old-name/iu);
  });

  it("refuses non-work-unit subjects, archived units, dirty trees, and open PRs", () => {
    expect(() => assertRenameSubjectPreconditions({
      subject: { kind: "branch", ref: "feat/old-name" },
      entry: entry("old-name"),
      dirty: false,
      prUrl: "[none]",
    })).toThrow(/work-unit/iu);
    expect(() => assertRenameSubjectPreconditions({
      subject: { kind: "work-unit", name: "old-name" },
      entry: entry("old-name", "completed"),
      dirty: false,
      prUrl: "[none]",
    })).toThrow(/completed|archived/iu);
    expect(() => assertRenameSubjectPreconditions({
      subject: { kind: "work-unit", name: "old-name" },
      entry: entry("old-name"),
      dirty: true,
      prUrl: "[none]",
    })).toThrow(/dirty/iu);
    expect(() => assertRenameSubjectPreconditions({
      subject: { kind: "work-unit", name: "old-name" },
      entry: entry("old-name"),
      dirty: false,
      prUrl: "https://example.test/pr/1",
    })).toThrow(/open PR/iu);
  });
});

describe("assertRenameCollisionFree", () => {
  it("refuses a live sibling visible in composed truth", () => {
    expect(() => assertRenameCollisionFree(
      composed(index(entry("old-name"), entry("new-name"))),
      { resolvedSlug: "old-name", targetSlug: "new-name" },
    )).toThrow(/new-name.*different/iu);
  });

  it("accepts the subject's own new slug on resume", () => {
    expect(() => assertRenameCollisionFree(
      composed(index(entry("new-name"))),
      { resolvedSlug: "new-name", targetSlug: "new-name" },
    )).not.toThrow();
  });

  it("refuses indeterminate live truth", () => {
    expect(() => assertRenameCollisionFree(
      composed(index(), { indeterminate: "new-name" }),
      { resolvedSlug: "old-name", targetSlug: "new-name" },
    )).toThrow(/indeterminate/iu);
  });

  it("accepts an unused target slug", () => {
    expect(() => assertRenameCollisionFree(
      composed(index(entry("old-name"))),
      { resolvedSlug: "old-name", targetSlug: "new-name" },
    )).not.toThrow();
  });

  it("accepts an unused target from degraded reachable tree truth", () => {
    expect(() => assertRenameCollisionFree(
      composed(index(entry("old-name")), { unreachable: true }),
      { resolvedSlug: "old-name", targetSlug: "new-name" },
    )).not.toThrow();
  });
});
