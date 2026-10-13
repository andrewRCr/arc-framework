import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveComposedViewTarget } from "../../../src/handlers/view.js";
import { mergeProjectReadinessRecords, type ProjectReadinessRecordCandidate } from "../../../src/lib/status/project-view.js";
import type { WorkUnitArtifactReaders } from "../../../src/lib/status/work-unit-purpose.js";
import type { ComposedLifecycleIndexResult } from "../../../src/lib/work-unit/composed-lifecycle-index.js";
import { buildLifecycleIndexFromRecords } from "../../../src/lib/work-unit/lifecycle-index.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";

const cwd = join("/repo", "base");
const worktree = join("/repo", "sibling");
const metaPath = ".arc/active/meta-topic.md";
const ref = "refs/heads/feat/topic";
const selectedMeta = makeMetaFixture("topic", { branch: "feat/topic", taskList: "tasks-topic.md" });

function composition(candidate: ProjectReadinessRecordCandidate, checkout?: string): ComposedLifecycleIndexResult {
  const record = mergeProjectReadinessRecords([candidate])[0];
  if (record === undefined) throw new Error("fixture record absent");
  return {
    index: buildLifecycleIndexFromRecords([{ ...record, path: record.source.path, cohort: null }]),
    recordsBySlug: new Map([[record.slug, { selected: record, currentTree: null }]]),
    qualityFacts: { warnings: [], resultMarks: [], bySlug: new Map() },
    worktreePathBySlug: new Map(checkout === undefined ? [] : [[record.slug, checkout]]),
    liveRefs: {}, reachable: false, readQuality: "tree-only",
  };
}

function readers(files: Record<string, string>): WorkUnitArtifactReaders {
  return {
    fs: { readFile: async (path) => {
      const content = files[path];
      if (content === undefined) throw new Error("file missing");
      return content;
    } },
    readAtRef: async (requestedRef, path) => requestedRef === ref && path === metaPath
      ? { mode: "100644", bytes: new TextEncoder().encode(selectedMeta) } : null,
  };
}

describe("composed view target", () => {
  const started: ProjectReadinessRecordCandidate = {
    slug: "topic", location: "active", state: "Active", priority: "P2", dependsOn: [],
    source: { kind: "in-flight-meta", location: "active", path: `${ref}:${metaPath}` },
  };

  it("selects a registered checkout and reads its uncommitted metadata", async () => {
    const result = await resolveComposedViewTarget({
      cwd, slug: "topic", composition: composition(started, worktree),
      readers: readers({ [join(worktree, metaPath)]: makeMetaFixture("topic", { taskList: "tasks-edited.md" }) }),
    });
    expect(result).toMatchObject({
      status: "resolved", location: "active", metaPath, taskListPath: ".arc/active/tasks-edited.md",
      artifactSource: { kind: "checkout", cwd: worktree },
    });
  });

  it("selects the local ref when there is no registered checkout", async () => {
    const result = await resolveComposedViewTarget({ cwd, slug: "topic", composition: composition(started), readers: readers({}) });
    expect(result).toMatchObject({
      status: "resolved", metaPath, taskListPath: ".arc/active/tasks-topic.md",
      artifactSource: { kind: "ref", ref },
    });
  });

  it("keeps a local backlog placement in this checkout", async () => {
    const path = ".arc/backlog/planned/topic/meta-topic.md";
    const candidate: ProjectReadinessRecordCandidate = {
      ...started, location: "planned", state: "Planning",
      source: { kind: "backlog-stub", location: "planned", path },
    };
    const result = await resolveComposedViewTarget({
      cwd, slug: "topic", composition: composition(candidate),
      readers: readers({ [join(cwd, path)]: makeMetaFixture("topic", { state: "Planning" }) }),
    });
    expect(result).toMatchObject({
      status: "resolved", location: "planned", placement: { kind: "backlog", commitment: "planned" },
      artifactSource: { kind: "checkout", cwd },
    });
  });

  it("refuses indeterminate evidence with its warning rather than returning the backlog copy", async () => {
    const path = ".arc/backlog/planned/topic/meta-topic.md";
    const composed = composition({ ...started, location: "planned", state: "Planning", source: { kind: "backlog-stub", location: "planned", path } });
    composed.qualityFacts = {
      warnings: [], resultMarks: [],
      bySlug: new Map([["topic", { marks: ["degraded"], warnings: [{ code: "meta-read-failed", workUnit: "topic", rendered: "Cannot read started metadata." }] }]]),
    };
    expect(await resolveComposedViewTarget({
      cwd, slug: "topic", composition: composed,
      readers: readers({ [join(cwd, path)]: makeMetaFixture("topic", { state: "Planning" }) }),
    })).toMatchObject({ status: "unavailable", message: expect.stringContaining("Cannot read started metadata.") });
  });
});
