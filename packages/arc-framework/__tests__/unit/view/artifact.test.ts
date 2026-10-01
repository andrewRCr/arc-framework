/** Unit tests for semantic `arc view` artifact resolution. */

import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";

import {
  resolveViewArtifact,
  type ViewArtifactDependencies,
} from "../../../src/lib/view-artifact.js";
import type { ResolvedViewTarget } from "../../../src/lib/view/types.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";

const CWD = "/repo";

const TARGET: ResolvedViewTarget = {
  status: "resolved",
  slug: SlugSchema.parse("feature"),
  placement: { kind: "active", scope: { kind: "project" } },
  location: "active",
  metaPath: ".arc/active/meta-feature.md",
  taskListPath: ".arc/active/tasks-feature.md",
};

function deps(overrides: Partial<ViewArtifactDependencies> = {}): ViewArtifactDependencies {
  return {
    resolveAmbientTarget: vi.fn().mockResolvedValue(TARGET),
    resolveExplicitTarget: vi.fn().mockResolvedValue({ status: "unavailable" }),
    resolveCohort: vi.fn().mockResolvedValue(null),
    resolveSessionNotes: vi.fn().mockResolvedValue({ status: "absent" }),
    resolveUserSurfaces: vi.fn().mockResolvedValue({
      identityGlobalPath: (...segments: readonly string[]) =>
        ["/primary/.arc/user/andrew", ...segments].join("/"),
      workingMemoryPath: "/primary/.arc/user/andrew/WORKING-MEMORY.md",
    }),
    pathExists: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function resolve(
  kind: string | undefined,
  dependencies = deps(),
  options: { identity?: string | null; project?: boolean; forSlug?: string } = {},
) {
  return resolveViewArtifact({
    cwd: CWD,
    ...(kind === undefined ? {} : { kind }),
    project: options.project ?? false,
    identity: options.identity === undefined ? "andrew" : options.identity,
    ...(options.forSlug === undefined ? {} : { forSlug: options.forSlug }),
  }, dependencies);
}

describe("resolveViewArtifact", () => {
  it("resolves meta and a valid task-list pointer from the neutral target", async () => {
    await expect(resolve("meta")).resolves.toEqual({
      status: "resolved",
      kind: "meta",
      path: "/repo/.arc/active/meta-feature.md",
      workUnit: "feature",
    });
    await expect(resolve("tasks")).resolves.toEqual({
      status: "resolved",
      kind: "tasks",
      path: "/repo/.arc/active/tasks-feature.md",
      workUnit: "feature",
    });
  });

  it.each([
    ["spec", "/repo/.arc/active/spec-feature.md"],
    ["draft", "/repo/.arc/active/draft-feature.md"],
    ["notes", "/repo/.arc/active/notes-feature.md"],
  ])("resolves the %s sibling beside the target meta", async (kind, path) => {
    await expect(resolve(kind)).resolves.toEqual({ status: "resolved", kind, path, workUnit: "feature" });
  });

  it("falls back to the conventional task sibling when the pointer is absent or stale", async () => {
    const noPointer = deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({ ...TARGET, taskListPath: null }),
    });
    await expect(resolve("tasks", noPointer)).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/active/tasks-feature.md",
    });

    const stalePointer = deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({
        ...TARGET,
        taskListPath: ".arc/active/tasks-old.md",
      }),
      pathExists: vi.fn(async (path: string) => path.endsWith("tasks-feature.md")),
    });
    await expect(resolve("tasks", stalePointer)).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/active/tasks-feature.md",
    });
  });

  it("preserves an existing non-conventional task pointer and returns absence when neither candidate exists", async () => {
    const custom = deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({
        ...TARGET,
        taskListPath: ".arc/active/checklist.md",
      }),
      pathExists: vi.fn(async (path: string) => path.endsWith("checklist.md")),
    });
    await expect(resolve("tasks", custom)).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/active/checklist.md",
    });
    await expect(resolve("tasks", deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({ ...TARGET, taskListPath: null }),
      pathExists: vi.fn().mockResolvedValue(false),
    }))).resolves.toEqual({ status: "absent", kind: "tasks" });
  });

  it("projects conventional siblings from placement rather than the exact meta directory", async () => {
    const target = {
      ...TARGET,
      placement: { kind: "backlog", commitment: "planned", cohort: [SlugSchema.parse("coh")] } as const,
      metaPath: "custom/record.md",
      taskListPath: null,
    };
    const dependencies = deps({ resolveAmbientTarget: vi.fn().mockResolvedValue(target) });

    await expect(resolve("tasks", dependencies)).resolves.toMatchObject({
      path: "/repo/.arc/backlog/planned/coh/feature/tasks-feature.md",
    });
    await expect(resolve("spec", dependencies)).resolves.toMatchObject({
      path: "/repo/.arc/backlog/planned/coh/feature/spec-feature.md",
    });
  });

  it("uses the explicit target in preference to the ambient target", async () => {
    const ambient = vi.fn().mockRejectedValue(new Error("must not run"));
    const explicit = vi.fn().mockResolvedValue({
      ...TARGET,
      slug: "planned",
      location: "planned",
      metaPath: ".arc/backlog/planned/meta-planned.md",
      taskListPath: null,
    });
    await expect(resolve("meta", deps({
      resolveAmbientTarget: ambient,
      resolveExplicitTarget: explicit,
    }), { forSlug: "planned" })).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/backlog/planned/meta-planned.md",
      workUnit: "planned",
    });
    expect(ambient).not.toHaveBeenCalled();
  });

  it("exposes a typed recorded-target consumer seam after ambient resolution", async () => {
    const recorded = vi.fn().mockResolvedValue({
      ...TARGET,
      slug: "groomed",
      location: "planned",
      metaPath: ".arc/backlog/planned/meta-groomed.md",
    });
    await expect(resolve("meta", deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({ status: "unavailable" }),
      resolveRecordedTarget: recorded,
    }))).resolves.toMatchObject({ status: "resolved", workUnit: "groomed" });
    expect(recorded).toHaveBeenCalledWith({ cwd: CWD });
  });

  it("fails closed for unavailable and completed explicit targets", async () => {
    await expect(resolve("meta", deps({
      resolveExplicitTarget: vi.fn().mockResolvedValue({ status: "unavailable", slug: "missing" }),
    }), { forSlug: "missing" })).resolves.toMatchObject({
      status: "error",
      message: expect.stringContaining("unavailable in this checkout"),
    });
    await expect(resolve("meta", deps({
      resolveExplicitTarget: vi.fn().mockResolvedValue({ status: "completed", slug: "done" }),
    }), { forSlug: "done" })).resolves.toMatchObject({
      status: "error",
      message: expect.stringContaining("completed viewing is unsupported"),
    });
  });

  it.each([
    [["meta"], "meta"],
    [["meta", "draft"], "draft"],
    [["meta", "draft", "spec"], "spec"],
    [["meta", "draft", "spec", "tasks"], "tasks"],
  ])("bare view selects the furthest present artifact", async (presentKinds, expectedKind) => {
    const paths = new Set(presentKinds.map((kind) => `/repo/.arc/active/${kind}-feature.md`));
    await expect(resolve(undefined, deps({
      pathExists: vi.fn(async (path: string) => paths.has(path)),
    }))).resolves.toMatchObject({ status: "resolved", kind: expectedKind });
  });

  it("resolves cohort and per-WU session notes through their semantic resolvers", async () => {
    await expect(resolve("cohort", deps({
      resolveCohort: vi.fn().mockResolvedValue(".arc/backlog/planned/c/cohort-c.md"),
    }))).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/backlog/planned/c/cohort-c.md",
    });
    await expect(resolve("session-notes", deps({
      resolveSessionNotes: vi.fn().mockResolvedValue({
        status: "resolved",
        path: "/repo/.arc/user/andrew/feature/SESSION-NOTES.md",
      }),
    }))).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/user/andrew/feature/SESSION-NOTES.md",
    });
  });

  it("roots identity-global kinds at the primary worktree without resolving a WU", async () => {
    const ambient = vi.fn().mockRejectedValue(new Error("must not run"));
    const dependencies = deps({ resolveAmbientTarget: ambient });
    await expect(resolve("working-memory", dependencies)).resolves.toMatchObject({
      status: "resolved",
      path: "/primary/.arc/user/andrew/WORKING-MEMORY.md",
    });
    await expect(resolve("inbox", dependencies)).resolves.toMatchObject({
      status: "resolved",
      path: "/primary/.arc/user/andrew/USER-INBOX.md",
    });
    expect(ambient).not.toHaveBeenCalled();
  });

  it("resolves the project inbox independently of identity", async () => {
    await expect(resolve("inbox", deps(), { identity: null, project: true })).resolves.toEqual({
      status: "resolved",
      kind: "inbox",
      path: "/repo/.arc/backlog/ATOMIC-INBOX.md",
      workUnit: null,
    });
  });

  it.each([true, false])("resolves a decomposed native inbox root with existence %s", async (exists) => {
    const cwd = "/repo/cafe\u0301";
    const path = join(cwd, ".arc", "backlog", "ATOMIC-INBOX.md");
    const dependencies = deps({ pathExists: async (candidate) => exists && candidate === path });

    await expect(resolveViewArtifact({ cwd, kind: "inbox", project: true, identity: null }, dependencies))
      .resolves.toEqual(exists
        ? { status: "resolved", kind: "inbox", path, workUnit: null }
        : { status: "absent", kind: "inbox" });
  });

  it("reports unknown kind, WU-context, identity, and session-note errors", async () => {
    await expect(resolve("bogus")).resolves.toMatchObject({ status: "error", kind: "bogus" });
    await expect(resolve("tasks", deps({
      resolveAmbientTarget: vi.fn().mockResolvedValue({ status: "unavailable" }),
    }))).resolves.toMatchObject({ status: "error", kind: "tasks" });
    await expect(resolve("inbox", deps(), { identity: null })).resolves.toMatchObject({
      status: "error",
      kind: "inbox",
    });
    await expect(resolve("session-notes", deps({
      resolveSessionNotes: vi.fn().mockResolvedValue({
        status: "error",
        message: "SESSION-NOTES directory is ambiguous.",
      }),
    }))).resolves.toEqual({
      status: "error",
      kind: "session-notes",
      message: "SESSION-NOTES directory is ambiguous.",
    });
  });
});
