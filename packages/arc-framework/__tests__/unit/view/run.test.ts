/**
 * Unit tests for the `arc view` orchestrator.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runView } from "../../../src/commands/view.js";
import type { RunViewOptions, ViewArtifactResolver, ViewDependencies } from "../../../src/commands/view.js";

describe("runView", () => {
  const referenceArtifact = {
    status: "resolved", kind: "spec", workUnit: "feature", ref: "refs/heads/feat/feature",
    content: "# Selected ref copy\n", displayLabel: "refs/heads/feat/feature:.arc/active/spec-feature.md",
  } as const;

  it("renders selected reference content without reading a checkout file", async () => {
    const result = await runView({ cwd: "/repo", kind: "spec", project: false, identity: "andrew", nonInteractive: true }, {
      resolveArtifact: async () => referenceArtifact,
      readFile: async () => { throw new Error("checkout read forbidden"); },
    });
    expect(result).toMatchObject({ stderr: "", exitCode: 0 });
    expect(result.stdout).toMatch(/^spec · feature · 1 line · rendered \d{2}:\d{2}\n\n# Selected ref copy\n$/u);
  });

  it.each(["path", "editor"] as const)("refuses %s for a reference artifact with a rendering remedy", async (destination) => {
    const result = await runView({
      cwd: "/repo", kind: "spec", project: false, identity: "andrew", [destination]: true, editorAllowed: true,
    }, {
      resolveArtifact: async () => referenceArtifact,
      readFile: async () => { throw new Error("checkout read forbidden"); },
      launchEditor: async () => { throw new Error("editor launch forbidden"); },
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("feature");
    expect(result.stderr).toContain("refs/heads/feat/feature");
    expect(result.stderr).toContain("arc view spec --for feature");
  });

  it("passes an omitted kind through as bare lifecycle-aware view", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({
      status: "resolved",
      kind: "meta",
      path: "/repo/.arc/active/meta-feature.md",
      workUnit: "feature",
    });

    await runView({ cwd: "/repo", kind: undefined, project: false, identity: "andrew" }, {
      resolveArtifact,
      readFile: vi.fn().mockResolvedValue("# Meta\n"),
    });

    expect(resolveArtifact).toHaveBeenCalledWith({
      cwd: "/repo",
      project: false,
      identity: "andrew",
    });
  });

  it("forces tasks for omitted-kind --current", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({
      status: "absent",
      kind: "tasks",
    });
    await runView({
      cwd: "/repo", project: false, identity: "andrew", current: true,
    }, { resolveArtifact, readFile: vi.fn() });
    expect(resolveArtifact).toHaveBeenCalledWith({
      cwd: "/repo", kind: "tasks", project: false, identity: "andrew",
    });
  });

  it("validates --for and rejects identity-global combinations before resolution", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>();
    await expect(runView({
      cwd: "/repo", kind: "meta", project: false, identity: "andrew", forSlug: "../bad",
    }, { resolveArtifact, readFile: vi.fn() })).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("Invalid work-unit slug"),
    });
    await expect(runView({
      cwd: "/repo", kind: "working-memory", project: false, identity: "andrew", forSlug: "feature",
    }, { resolveArtifact, readFile: vi.fn() })).resolves.toMatchObject({
      exitCode: 1,
      stderr: expect.stringContaining("identity-global"),
    });
    expect(resolveArtifact).not.toHaveBeenCalled();
  });

  it("threads a valid explicit target to every WU-scoped kind", async () => {
    for (const kind of ["meta", "tasks", "spec", "draft", "notes", "cohort", "session-notes"] as const) {
      const resolveArtifact = vi.fn<ViewArtifactResolver>().mockResolvedValue({ status: "absent", kind });
      await runView({
        cwd: "/repo", kind, project: false, identity: "andrew", forSlug: "feature",
      }, { resolveArtifact, readFile: vi.fn() });
      expect(resolveArtifact).toHaveBeenCalledWith(expect.objectContaining({ forSlug: "feature", kind }));
    }
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

  it("prints the resolved path under --path without reading or rendering", async () => {
    const readFile = vi.fn();
    const resolveRenderer = vi.fn();
    const renderWithPager = vi.fn();

    await expect(runView({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
      path: true,
      nonInteractive: false,
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({
        status: "resolved",
        kind: "tasks",
        path: "/repo/.arc/active/tasks-feature.md",
        workUnit: "feature",
      }),
      readFile,
      resolveRenderer,
      renderWithPager,
    })).resolves.toEqual({
      stdout: "/repo/.arc/active/tasks-feature.md\n",
      stderr: "",
      exitCode: 0,
    });
    expect(readFile).not.toHaveBeenCalled();
    expect(resolveRenderer).not.toHaveBeenCalled();
    expect(renderWithPager).not.toHaveBeenCalled();
  });

  it("fails an absent artifact under --path so no stray text reaches a consumer", async () => {
    await expect(runView({
      cwd: "/repo",
      kind: "notes",
      project: false,
      identity: "andrew",
      path: true,
    }, {
      resolveArtifact: vi.fn().mockResolvedValue({ status: "absent", kind: "notes" }),
      readFile: vi.fn(),
    })).resolves.toEqual({
      stdout: "",
      stderr: "notes is not present.\n",
      exitCode: 1,
    });
  });

  it("rejects --path with --current before resolution", async () => {
    const resolveArtifact = vi.fn<ViewArtifactResolver>();

    await expect(runView({
      cwd: "/repo",
      kind: "tasks",
      project: false,
      identity: "andrew",
      current: true,
      path: true,
    }, { resolveArtifact, readFile: vi.fn() })).resolves.toEqual({
      stdout: "",
      stderr: "--path cannot be combined with --current.\n",
      exitCode: 1,
    });
    expect(resolveArtifact).not.toHaveBeenCalled();
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
      anchor: { line: 4, id: "1.1" },
    }));
    expect(result.stderr).toBe("");
  });
});

describe("runView editor destination", () => {
  let cwd: string;
  let path: string;
  let openedContent: string | undefined;
  let options: RunViewOptions;
  let dependencies: ViewDependencies;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "arc-view-editor-"));
    path = join(cwd, "artifact with spaces.md");
    await writeFile(path, "# Original file\n");
    openedContent = undefined;
    options = { cwd, project: false, identity: "andrew", editor: true, editorAllowed: true };
    dependencies = {
      resolveArtifact: async () => ({
        status: "resolved", kind: "spec", path: "artifact with spaces.md", workUnit: "feature",
      }),
      readFile: async () => { throw new Error("Presentation read must be unused"); },
      resolveRenderer: async () => { throw new Error("Renderer must be unused"); },
      renderWithPager: async () => { throw new Error("Pager must be unused"); },
      now: () => { throw new Error("Formatting clock must be unused"); },
      launchEditor: async (file) => { openedContent = await readFile(file, "utf8"); },
    };
  });

  afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

  it("opens the real absolute file before presentation and leaves its bytes unchanged", async () => {
    expect(await runView(options, dependencies)).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(openedContent).toBe("# Original file\n");
    expect(await readFile(path, "utf8")).toBe("# Original file\n");
  });

  it.each(["path", "current"] as const)("rejects editor with %s before resolution", async (destination) => {
    dependencies.resolveArtifact = async () => { throw new Error("Resolution must be unused"); };
    const result = await runView({ ...options, [destination]: true }, dependencies);
    expect(result).toMatchObject({ stdout: "", exitCode: 1 });
    expect(result.stderr).toContain(`--editor cannot be combined with --${destination}`);
    expect(openedContent).toBeUndefined();
  });

  it.each([false, undefined])("refuses editor without explicit interaction permission (%s)", async (editorAllowed) => {
    dependencies.resolveArtifact = async () => { throw new Error("Resolution must be unused"); };
    const result = await runView({ ...options, editorAllowed }, dependencies);
    expect(result).toMatchObject({ stdout: "", exitCode: 1 });
    expect(result.stderr).toMatch(/--editor requires.*interactive/);
    expect(openedContent).toBeUndefined();
  });

  it("fails absence without opening a file", async () => {
    dependencies.resolveArtifact = async () => ({ status: "absent", kind: "spec" });
    expect(await runView(options, dependencies)).toEqual({
      stdout: "", stderr: "spec is not present.\n", exitCode: 1,
    });
    expect(openedContent).toBeUndefined();
  });

  it("reports a failed handoff with an override remedy and permits a later retry", async () => {
    const launchEditor = dependencies.launchEditor;
    dependencies.launchEditor = async () => { throw new Error("Editor exited unsuccessfully"); };
    const result = await runView(options, dependencies);
    expect(result).toMatchObject({ stdout: "", exitCode: 1 });
    expect(result.stderr).toMatch(/Editor exited unsuccessfully.*ARC_EDITOR/);
    dependencies.launchEditor = launchEditor;
    expect(await runView(options, dependencies)).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    expect(openedContent).toBe("# Original file\n");
  });
});
