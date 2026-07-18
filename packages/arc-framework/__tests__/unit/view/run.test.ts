/**
 * Unit tests for the `arc view` orchestrator.
 */

import { describe, expect, it, vi } from "vitest";

import { runView } from "../../../src/commands/view.js";
import type { ViewArtifactResolver } from "../../../src/commands/view.js";

describe("runView", () => {
  it("defaults an omitted kind to tasks", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({
      status: "absent",
      kind: "tasks",
    });

    await runView({ cwd: "/repo", kind: undefined, project: false, identity: "andrew" }, {
      resolveArtifact,
      readFile: vi.fn(),
    });

    expect(resolveArtifact).toHaveBeenCalledWith({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
    });
  });

  it("passes an explicit kind through unchanged", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({
      status: "absent",
      kind: "spec",
    });

    await runView({ cwd: "/repo", kind: "spec", project: false, identity: "andrew" }, {
      resolveArtifact,
      readFile: vi.fn(),
    });

    expect(resolveArtifact).toHaveBeenCalledWith({
      cwd: "/repo",
      kind: "spec",
      project: false,
      identity: "andrew",
    });
  });

  it("emits resolved content as undecorated stdout", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({
      status: "resolved",
      kind: "tasks",
      path: "/repo/.arc/active/tasks-feature.md",
      workUnit: "feature",
    });

    const result = await runView({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
      nonInteractive: true,
    }, {
      resolveArtifact,
      readFile: vi.fn().mockResolvedValue("# Tasks\n\n- [ ] Do it\n"),
    });

    expect(result).toEqual({
      stdout: "# Tasks\n\n- [ ] Do it\n",
      stderr: "",
      exitCode: 0,
    });
  });

  it("renders normal absence on stdout and resolution errors on stderr", async () => {
    await expect(runView({
      cwd: "/repo",
      kind: "notes",
      project: false,
      identity: "andrew",
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({ status: "absent", kind: "notes" }),
      readFile: vi.fn(),
    })).resolves.toEqual({
      stdout: "notes is not present.\n",
      stderr: "",
      exitCode: 0,
    });

    await expect(runView({
      cwd: "/repo",
      kind: "bogus",
      project: false,
      identity: "andrew",
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({
        status: "error",
        kind: "bogus",
        message: "Unknown view kind.",
      }),
      readFile: vi.fn(),
    })).resolves.toEqual({
      stdout: "",
      stderr: "Unknown view kind.\n",
      exitCode: 1,
    });
  });

  it("rejects --current for a non-task kind before normal absence handling", async () => {
    await expect(runView({
      cwd: "/repo",
      kind: "notes",
      project: false,
      identity: "andrew",
      current: true,
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({ status: "absent", kind: "notes" }),
      readFile: vi.fn(),
    })).resolves.toEqual({
      stdout: "",
      stderr: "--current is only valid with the tasks kind.\n",
      exitCode: 1,
    });
  });

  it("routes TTY content through the selected renderer and carries warnings on stderr", async () => {
    const renderWithPager = vi.fn().mockResolvedValue(undefined);
    const result = await runView({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
      nonInteractive: false,
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({
        status: "resolved",
        kind: "tasks",
        path: "/repo/.arc/active/tasks-feature.md",
        workUnit: "feature",
      }),
      readFile: vi.fn().mockResolvedValue("# Tasks\n"),
      resolveRenderer: vi.fn().mockResolvedValue({
        renderer: "bat",
        warnings: ["invalid renderer ignored"],
      }),
      renderWithPager,
    });

    expect(renderWithPager).toHaveBeenCalledWith({
      renderer: "bat",
      content: "# Tasks\n",
      displayPath: "/repo/.arc/active/tasks-feature.md",
    });
    expect(result).toEqual({
      stdout: "",
      stderr: "warning: invalid renderer ignored\n",
      exitCode: 0,
    });
  });

  it("carries the current-task anchor to Glow without a degrade warning", async () => {
    const renderWithPager = vi.fn().mockResolvedValue(undefined);
    const result = await runView({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
      nonInteractive: false,
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({
        status: "resolved",
        kind: "tasks",
        path: "/repo/.arc/active/tasks-feature.md",
        workUnit: "feature",
      }),
      readFile: vi.fn().mockResolvedValue([
        "# Tasks",
        "",
        "## **Phase 1:** Build",
        "",
        "### `[ ]` **1.1 First task**",
        "",
      ].join("\n")),
      resolveRenderer: vi.fn().mockResolvedValue({ renderer: "glow", warnings: [] }),
      renderWithPager,
      now: () => new Date(2026, 0, 1, 9, 30),
    });

    expect(renderWithPager).toHaveBeenCalledWith(expect.objectContaining({
      renderer: "glow",
      anchor: { line: 7, id: "1.1" },
    }));
    expect(result.stderr).toBe("");
  });
});
