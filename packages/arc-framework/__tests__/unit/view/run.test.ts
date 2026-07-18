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
});
