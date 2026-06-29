import { describe, expect, it } from "vitest";

import { LOAD_SET_MANIFEST_VERSION } from "../../../src/lib/load-set/types.js";
import { resolveLoadSetManifest } from "../../../src/lib/load-set/projection.js";

const BASE_INPUT = {
  identity: "andrew",
  activeWorkUnit: "loadset-projection",
  metaPath: ".arc/active/meta-loadset-projection.md",
  taskListPath: ".arc/active/tasks-loadset-projection.md",
  activeExtensions: [],
  cohortDocPath: null,
} as const;

function fullEntry(path: string) {
  return { path, readMode: { kind: "full" } };
}

describe("resolveLoadSetManifest", () => {
  it("resolves planning sessions with the planning-stage lifecycle and no task-list entry", () => {
    const manifest = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "planning",
      planningStage: "create-spec",
    });

    expect(manifest.manifestVersion).toBe(LOAD_SET_MANIFEST_VERSION);
    expect(manifest.entries).toEqual([
      fullEntry(".arc/reference/briefs/AGENT-BRIEF.ARC.md"),
      fullEntry(".arc/reference/briefs/AGENT-BRIEF.PROJECT.md"),
      fullEntry(".arc/system/rules/DEV-RULES.ARC.md"),
      fullEntry(".arc/system/rules/DEV-RULES.PROJECT.md"),
      fullEntry(".arc/reference/strategies/STRATEGY-INDEX.md"),
      {
        path: ".arc/reference/QUICK-REFERENCE.md",
        readMode: {
          kind: "partial-section",
          heading: "Environment & Path Context",
        },
      },
      fullEntry(".arc/active/meta-loadset-projection.md"),
      fullEntry(".arc/user/andrew/loadset-projection/SESSION-NOTES.md"),
      fullEntry(".arc/user/andrew/WORKING-MEMORY.md"),
      fullEntry(".arc/system/workflows/arc/create-spec.md"),
    ]);
  });

  it("leaves harness-managed instruction files out of ARC recovery context", () => {
    const manifest = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "planning",
      planningStage: "create-spec",
    });

    expect(manifest.entries[0]).toEqual(fullEntry(".arc/reference/briefs/AGENT-BRIEF.ARC.md"));
    expect(manifest.entries).not.toContainEqual(fullEntry("AGENTS.md"));
    expect(manifest.entries).not.toContainEqual(fullEntry("CLAUDE.md"));
  });

  it("returns detached copies of static context entries", () => {
    const first = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "planning",
      planningStage: "create-spec",
    });
    const second = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "planning",
      planningStage: "create-spec",
    });

    expect(first.entries[0]).not.toBe(second.entries[0]);
    expect(first.entries[0]?.readMode).not.toBe(second.entries[0]?.readMode);
    expect(first.entries[5]?.readMode).not.toBe(second.entries[5]?.readMode);
  });

  it("resolves execution sessions with the task-list slice and process-task-loop", () => {
    const manifest = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "execution",
      planningStage: null,
    });

    expect(manifest.entries).toContainEqual({
      path: ".arc/active/tasks-loadset-projection.md",
      readMode: { kind: "partial-strategic" },
    });
    expect(manifest.entries).toContainEqual(
      fullEntry(".arc/system/workflows/arc/process-task-loop.md"),
    );
  });

  it("resolves integration sessions with the integration lifecycle workflow", () => {
    const manifest = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "integration",
      planningStage: null,
    });

    expect(manifest.entries).not.toContainEqual({
      path: ".arc/active/tasks-loadset-projection.md",
      readMode: { kind: "partial-strategic" },
    });
    expect(manifest.entries).toContainEqual(
      fullEntry(".arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md"),
    );
  });

  it("keeps active extension bodies out of the session load set while including the cohort doc", () => {
    const manifest = resolveLoadSetManifest({
      ...BASE_INPUT,
      sessionType: "execution",
      planningStage: null,
      activeExtensions: ["post-context-load", "pre-pr-review"],
      cohortDocPath: ".arc/backlog/planned/loadset/cohort-loadset.md",
    });

    expect(manifest.entries).toEqual(
      expect.arrayContaining([
        fullEntry(".arc/backlog/planned/loadset/cohort-loadset.md"),
      ]),
    );
    expect(manifest.entries).not.toContainEqual(
      fullEntry(".arc/system/extensions/post-context-load.md"),
    );
    expect(manifest.entries).not.toContainEqual(
      fullEntry(".arc/system/extensions/pre-pr-review.md"),
    );
  });
});
