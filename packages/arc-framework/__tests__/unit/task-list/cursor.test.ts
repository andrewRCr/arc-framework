import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { resolveTaskListCursorFromFile } from "../../../src/lib/task-list/file-cursor.js";

function taskList(lines: readonly string[]): string {
  return lines.join("\n");
}

async function passthroughRealpath(path: string): Promise<string> {
  return path;
}

describe("resolveTaskListCursor", () => {
  it("returns the parent section and first open subtask leaf", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 1:** Build",
      "",
      "### `[ ]` **1.1 Implement cursor projection**",
      "",
      "- _Goal:_ Derive the cursor.",
      "",
      "    - `[x]` **1.1.a Parse parent tasks**",
      "",
      "    - `[ ]` **1.1.b Parse subtasks**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "1.1",
          title: "Implement cursor projection",
          lineHint: 5,
        },
        leaf: {
          id: "1.1.b",
          title: "Parse subtasks",
          lineHint: 11,
        },
      },
    });
  });

  it("uses a standalone open parent as both section and leaf", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed setup**",
      "",
      "### `[ ]` **1.2 Add standalone behavior**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "1.2",
          title: "Add standalone behavior",
          lineHint: 5,
        },
        leaf: {
          id: "1.2",
          title: "Add standalone behavior",
          lineHint: 5,
        },
      },
    });
  });

  it("accepts documented trailing notes on parent task headings", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 7:** Verification",
      "",
      "### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
        leaf: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
      },
    });
  });

  it("supports revision task identifiers", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 4.R:** Recovery authority revision",
      "",
      "### `[ ]` **4.R.2 Implement the shared task-list cursor projection**",
      "",
      "    - `[ ]` **4.R.2.a Cover revision identifiers**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "4.R.2",
          title: "Implement the shared task-list cursor projection",
          lineHint: 5,
        },
        leaf: {
          id: "4.R.2.a",
          title: "Cover revision identifiers",
          lineHint: 7,
        },
      },
    });
  });

  it("supports accepted revision and fourth-level identifier shapes", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 3.R:** Revision",
      "",
      "### `[x]` **3.R.k Parent revision letter**",
      "",
      "### `[ ]` **4.2.R Remaining subtask-level work**",
      "",
      "    - `[ ]` **4.2.R.1 Rare numbered child after revision marker**",
      "",
      "    - `[ ]` **4.2.a.1 Rare fourth-level child after letter**",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "4.2.R",
          title: "Remaining subtask-level work",
          lineHint: 7,
        },
        leaf: {
          id: "4.2.R.1",
          title: "Rare numbered child after revision marker",
          lineHint: 9,
        },
      },
    });
  });

  it("skips completed and deferred markers before the first open task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed**",
      "",
      "### `[~]` **1.2 Deferred**",
      "",
      "### `[ ]` **1.3 Continue here**",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "1.3", title: "Continue here", lineHint: 7 },
        leaf: { id: "1.3", title: "Continue here", lineHint: 7 },
      },
    });
  });

  it("accepts trailing notes on bold subtask titles", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **2.1 Parent**",
      "",
      "    - `[ ]` **2.1.a Wire the check** — project copy",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Parent", lineHint: 3 },
        leaf: { id: "2.1.a", title: "Wire the check", lineHint: 5 },
      },
    });
  });

  it("accepts plain single-line subtask titles", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **2.1 Parent**",
      "",
      "    - `[ ]` 2.1.a Plain subtask title",
    ]));

    expect(result).toMatchObject({
      status: "found",
      cursor: {
        section: { id: "2.1", title: "Parent", lineHint: 3 },
        leaf: { id: "2.1.a", title: "Plain subtask title", lineHint: 5 },
      },
    });
  });

  it("ignores root-level success criteria checkboxes after an open verification task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "## **Phase 7:** Verification",
      "",
      "### `[ ]` **7.1 Complete verification**",
      "",
      "- _Note:_ Validate success criteria.",
      "",
      "---",
      "",
      "## Success Criteria",
      "",
      "- `[ ]` On Claude Code and Codex, forcing a compaction injects recovery",
      "- `[ ]` All quality gates pass",
    ]));

    expect(result).toEqual({
      status: "found",
      cursor: {
        section: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
        leaf: {
          id: "7.1",
          title: "Complete verification",
          lineHint: 5,
        },
      },
    });
  });

  it("returns malformed for task-shaped checkbox bullets at root level", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1 Parent task**",
      "",
      "- `[ ]` **1.1.a Root task-shaped checkbox**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "task checkbox marker appeared at root level",
      },
    });
  });

  it("returns malformed for id-only checkbox bullets at root level", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1 Parent task**",
      "",
      "- `[ ]` **1.1.a**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "task checkbox marker appeared at root level",
      },
    });
  });

  it("returns no-open-task when every task is terminal", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[x]` **1.1 Completed**",
      "",
      "### `[~]` **1.2 Deferred**",
    ]));

    expect(result).toEqual({ status: "no-open-task" });
  });

  it("returns malformed for a parent marker without an id and title", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "task marker must include a valid id and title",
      },
    });
  });

  it("returns malformed for a marked heading without a task id", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **Complete verification now**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "task marker must include a valid id and title",
      },
    });
  });

  it("returns malformed for numeric third-level task identifiers", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1.1 Use a numeric third segment**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "task marker must include a valid id and title",
      },
    });
  });

  it("returns malformed for a subtask before any parent task", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "    - `[ ]` **1.1.a Orphan subtask**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 3,
        message: "subtask marker appeared before any parent task",
      },
    });
  });

  it("returns malformed for likely subtasks with invalid indentation", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1 Parent task**",
      "",
      "  - `[ ]` **1.1.a Bad indentation**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "subtask marker does not match task-list bullet grammar",
      },
    });
  });

  it("returns malformed for id-only subtasks with invalid indentation", () => {
    const result = resolveTaskListCursor(taskList([
      "# Task List: Cursor",
      "",
      "### `[ ]` **1.1 Parent task**",
      "",
      "  - `[ ]` **1.1.a**",
    ]));

    expect(result).toEqual({
      status: "malformed",
      error: {
        line: 5,
        message: "subtask marker does not match task-list bullet grammar",
      },
    });
  });
});

describe("resolveTaskListCursorFromFile", () => {
  it("returns missing when the task-list file is absent", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

    const result = await resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: ".arc/active/tasks-widget.md",
      realpath: passthroughRealpath,
      readFile: async () => {
        throw enoent;
      },
    });

    expect(result).toEqual({
      status: "missing",
      path: ".arc/active/tasks-widget.md",
    });
  });

  it("returns missing when the absent task-list path stays inside the repository", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const readFile = async (): Promise<string> => {
      throw new Error("read should not be called");
    };

    const result = await resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: ".arc/active/tasks-widget.md",
      realpath: async (path) => {
        const normalized = path.replaceAll("\\", "/");
        if (normalized === "/repo" || normalized === "/repo/.arc" || normalized === "/repo/.arc/active") {
          return normalized;
        }
        if (normalized === "/repo/.arc/active/tasks-widget.md") throw enoent;
        throw new Error(`unexpected path: ${path}`);
      },
      readFile,
    });

    expect(result).toEqual({
      status: "missing",
      path: ".arc/active/tasks-widget.md",
    });
  });

  it("throws when the repository root is missing", async () => {
    const enoent = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    const readFile = async (): Promise<string> => {
      throw new Error("read should not be called");
    };

    await expect(resolveTaskListCursorFromFile({
      cwd: "/missing-repo",
      taskListPath: ".arc/active/tasks-widget.md",
      realpath: async (path) => {
        if (path === "/missing-repo") throw enoent;
        throw new Error(`unexpected path: ${path}`);
      },
      readFile,
    })).rejects.toThrow("Repository root not found: /missing-repo");
  });

  it("rejects absolute task-list paths before reading", async () => {
    const readFile = async (): Promise<string> => {
      throw new Error("read should not be called");
    };

    await expect(resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: "/tmp/tasks-widget.md",
      readFile,
    })).rejects.toThrow("Task list path must be repository-relative: /tmp/tasks-widget.md");
  });

  it("rejects parent-escaping task-list paths before reading", async () => {
    const readFile = async (): Promise<string> => {
      throw new Error("read should not be called");
    };

    await expect(resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: ".arc/active/../../outside.md",
      readFile,
    })).rejects.toThrow(
      "Task list path must be repository-relative: .arc/active/../../outside.md",
    );
  });

  it("rejects symlink escapes before reading", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-cursor-"));
    const outside = await mkdtemp(join(tmpdir(), "arc-cursor-outside-"));

    try {
      await mkdir(join(root, ".arc", "active"), { recursive: true });
      await writeFile(
        join(outside, "tasks-widget.md"),
        taskList([
          "# Task List: Widget",
          "",
          "### `[ ]` **1.1 Build widget**",
        ]),
      );
      await symlink(
        outside,
        join(root, ".arc", "active", "linked"),
        process.platform === "win32" ? "junction" : "dir",
      );

      await expect(resolveTaskListCursorFromFile({
        cwd: root,
        taskListPath: ".arc/active/linked/tasks-widget.md",
      })).rejects.toThrow(
        "Task list path must stay within the repository: .arc/active/linked/tasks-widget.md",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes when the target file is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-cursor-"));
    const outside = await mkdtemp(join(tmpdir(), "arc-cursor-outside-"));

    try {
      await mkdir(join(root, ".arc", "active"), { recursive: true });
      await symlink(
        outside,
        join(root, ".arc", "active", "linked"),
        process.platform === "win32" ? "junction" : "dir",
      );

      await expect(resolveTaskListCursorFromFile({
        cwd: root,
        taskListPath: ".arc/active/linked/missing.md",
      })).rejects.toThrow(
        "Task list path must stay within the repository: .arc/active/linked/missing.md",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects symlink escapes before an injected reader can read", async () => {
    await expect(resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: ".arc/active/linked/tasks-widget.md",
      realpath: async (path) => path === "/repo" ? "/repo" : "/tmp/outside/tasks-widget.md",
      readFile: async () => {
        throw new Error("read should not be called");
      },
    })).rejects.toThrow(
      "Task list path must stay within the repository: .arc/active/linked/tasks-widget.md",
    );
  });

  it("reads from the verified realpath", async () => {
    const reads: string[] = [];
    const result = await resolveTaskListCursorFromFile({
      cwd: "/repo-link",
      taskListPath: ".arc/active/tasks-widget.md",
      realpath: async (path) =>
        path === "/repo-link"
          ? "/repo-real"
          : "/repo-real/.arc/active/tasks-widget.md",
      readFile: async (path) => {
        reads.push(path);
        return taskList([
          "# Task List: Widget",
          "",
          "### `[ ]` **1.1 Build widget**",
        ]);
      },
    });

    expect(result).toMatchObject({ status: "found" });
    expect(reads).toEqual(["/repo-real/.arc/active/tasks-widget.md"]);
  });

  it("rethrows non-ENOENT read failures", async () => {
    const eacces = Object.assign(new Error("EACCES"), { code: "EACCES" });

    await expect(resolveTaskListCursorFromFile({
      cwd: "/repo",
      taskListPath: ".arc/active/tasks-widget.md",
      realpath: passthroughRealpath,
      readFile: async () => {
        throw eacces;
      },
    })).rejects.toThrow("EACCES");
  });
});
