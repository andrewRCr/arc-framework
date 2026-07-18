/**
 * Unit tests for semantic `arc view` artifact resolution.
 */

import { describe, expect, it, vi } from "vitest";

import {
  resolveViewArtifact,
  type ViewArtifactDependencies,
} from "../../../src/lib/view-artifact.js";
import type { ActiveSessionInitResult } from "../../../src/commands/active.js";

const CWD = "/repo";

function active(
  overrides: Partial<ActiveSessionInitResult> = {},
): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "single",
    path: ".arc/active/meta-feature.md",
    candidates: [],
    taskListPath: ".arc/active/tasks-feature.md",
    sessionType: "execution",
    currentWorkflow: null,
    planningStage: null,
    warnings: [],
    ...overrides,
  };
}

function deps(overrides: Partial<ViewArtifactDependencies> = {}): ViewArtifactDependencies {
  return {
    resolveActive: vi.fn().mockResolvedValue(active()),
    resolveCurrentBranch: vi.fn().mockResolvedValue("feat/feature"),
    resolveCohort: vi.fn().mockResolvedValue(null),
    resolveSessionNotes: vi.fn().mockResolvedValue({ status: "absent" }),
    resolveUserSurfaces: vi.fn().mockResolvedValue({
      identityGlobalPath: (...segments: readonly string[]) =>
        ["/primary/.arc/user/andrew", ...segments].join("/"),
    }),
    pathExists: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function resolve(
  kind: string,
  dependencies = deps(),
  options: { identity?: string | null; project?: boolean } = {},
) {
  return resolveViewArtifact({
    cwd: CWD,
    kind,
    project: options.project ?? false,
    identity: options.identity === undefined ? "andrew" : options.identity,
  }, dependencies);
}

describe("resolveViewArtifact", () => {
  it("resolves meta and tasks from the active oracle result", async () => {
    await expect(resolve("meta")).resolves.toEqual({
      status: "resolved",
      kind: "meta",
      path: "/repo/.arc/active/meta-feature.md",
    });
    await expect(resolve("tasks")).resolves.toEqual({
      status: "resolved",
      kind: "tasks",
      path: "/repo/.arc/active/tasks-feature.md",
    });
  });

  it("selects the unique branch-matching candidate when the oracle reports multiple", async () => {
    const dependencies = deps({
      resolveActive: vi.fn().mockResolvedValue(active({
        resolution: "multiple",
        path: null,
        taskListPath: undefined,
        candidates: [
          {
            path: ".arc/active/meta-other.md",
            filename: "meta-other.md",
            branch: "feat/other",
            state: "Active",
            nextTask: null,
            taskList: "tasks-other.md",
            nextAction: null,
            currentWorkflow: null,
          },
          {
            path: ".arc/active/meta-feature.md",
            filename: "meta-feature.md",
            branch: "feat/feature",
            state: "Active",
            nextTask: null,
            taskList: "tasks-feature.md",
            nextAction: null,
            currentWorkflow: null,
          },
        ],
      })),
    });

    await expect(resolve("tasks", dependencies)).resolves.toMatchObject({
      status: "resolved",
      path: "/repo/.arc/active/tasks-feature.md",
    });
  });

  it.each([
    ["spec", "/repo/.arc/active/spec-feature.md"],
    ["draft", "/repo/.arc/active/draft-feature.md"],
    ["notes", "/repo/.arc/active/notes-feature.md"],
  ])("resolves the %s sibling beside the active meta", async (kind, path) => {
    await expect(resolve(kind)).resolves.toEqual({ status: "resolved", kind, path });
  });

  it("maps a missing artifact and a [none] task list to absent", async () => {
    await expect(resolve("notes", deps({
      pathExists: vi.fn().mockResolvedValue(false),
    }))).resolves.toEqual({ status: "absent", kind: "notes" });
    await expect(resolve("tasks", deps({
      resolveActive: vi.fn().mockResolvedValue(active({ taskListPath: null })),
    }))).resolves.toEqual({ status: "absent", kind: "tasks" });
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

  it("roots identity-global kinds at the primary worktree without an active WU", async () => {
    const dependencies = deps({
      resolveActive: vi.fn().mockResolvedValue(active({ resolution: "none", path: null })),
    });
    await expect(resolve("working-memory", dependencies)).resolves.toMatchObject({
      status: "resolved",
      path: "/primary/.arc/user/andrew/WORKING-MEMORY.md",
    });
    await expect(resolve("inbox", dependencies)).resolves.toMatchObject({
      status: "resolved",
      path: "/primary/.arc/user/andrew/USER-INBOX.md",
    });
  });

  it("resolves the project inbox independently of identity", async () => {
    await expect(resolve("inbox", deps(), { identity: null, project: true })).resolves.toEqual({
      status: "resolved",
      kind: "inbox",
      path: "/repo/.arc/backlog/ATOMIC-INBOX.md",
    });
  });

  it("reports unknown kind, WU-context, identity, and session-note errors with valid kinds", async () => {
    await expect(resolve("bogus")).resolves.toMatchObject({ status: "error", kind: "bogus" });
    await expect(resolve("tasks", deps({
      resolveActive: vi.fn().mockResolvedValue(active({ resolution: "none", path: null })),
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
