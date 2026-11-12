/**
 * Unit tests for renderer selection and pager composition.
 */

import { spawnSync } from "node:child_process";

import { describe, expect, it, vi } from "vitest";

import {
  detectViewRenderer,
  renderViewWithPager,
  resolveViewRenderer,
  type PagerProcessRunner,
} from "../../../src/lib/view-renderer.js";

const glowAvailable = spawnSync("glow", ["--version"], { stdio: "ignore" }).status === 0;

function pagerDependencies(run: PagerProcessRunner): {
  run: PagerProcessRunner;
  environment: NodeJS.ProcessEnv;
} {
  return { run, environment: { ARC_VIEW_TEST: "true" } };
}

describe("detectViewRenderer", () => {
  it("selects glow first when it is available", async () => {
    const probe = vi.fn().mockResolvedValue(true);

    await expect(detectViewRenderer(probe)).resolves.toBe("glow");
    expect(probe).toHaveBeenCalledTimes(1);
    expect(probe).toHaveBeenCalledWith("glow");
  });

  it("selects bat when glow is unavailable", async () => {
    const probe = vi.fn().mockImplementation((command: string) => Promise.resolve(command === "bat"));

    await expect(detectViewRenderer(probe)).resolves.toBe("bat");
    expect(probe.mock.calls.map(([command]) => command)).toEqual(["glow", "bat"]);
  });

  it("falls back to plain when neither renderer is available", async () => {
    await expect(detectViewRenderer(vi.fn().mockResolvedValue(false))).resolves.toBe("plain");
  });
});

describe("resolveViewRenderer", () => {
  it("honors a valid user override without probing PATH", async () => {
    const probe = vi.fn().mockResolvedValue(true);

    await expect(resolveViewRenderer({
      cwd: "/repo",
      exec: vi.fn().mockResolvedValue({ stdout: "bat\n", stderr: "" }),
      readFile: vi.fn(),
      probe,
    })).resolves.toEqual({ renderer: "bat", warnings: [] });
    expect(probe).not.toHaveBeenCalled();
  });

  it("warns on an invalid override and falls back to detection", async () => {
    const probe = vi.fn().mockImplementation((command: string) => Promise.resolve(command === "glow"));

    await expect(resolveViewRenderer({
      cwd: "/repo",
      exec: vi.fn().mockResolvedValue({ stdout: "rainbow\n", stderr: "" }),
      readFile: vi.fn(),
      probe,
    })).resolves.toEqual({
      renderer: "glow",
      warnings: [expect.stringContaining("rainbow")],
    });
  });
});

describe("renderViewWithPager", () => {
  it.each([
    ["glow", "glow", ["--pager", "--width", "0", "-"], { LESS: "FRK" }],
    [
      "bat",
      "bat",
      ["--paging=always", "--style=plain", "--language=md", "--file-name", "tasks.md", "-"],
      { BAT_PAGER: "less -RFK" },
    ],
    ["plain", "less", ["-R", "-F", "-K"], { LESS: "FRK" }],
  ] as const)("composes %s through its pager mode on the alternate screen", async (
    renderer,
    command,
    args,
    pagerEnvironment,
  ) => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer,
      content: "# Tasks\n",
      displayPath: "tasks.md",
    }, pagerDependencies(run));

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      command,
      args,
      input: "# Tasks\n",
      env: expect.objectContaining({ ARC_VIEW_TEST: "true", ...pagerEnvironment }),
    }));
  });

  it("reflows prose soft breaks for Glow without changing Markdown structure", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "# Heading",
      "",
      "A prose paragraph authored across",
      "multiple source lines.",
      "",
      "- A list item authored across",
      "  multiple source lines.",
      "- A separate item.",
      "",
      "A deliberate hard break.  ",
      "This stays on the next line.",
      "",
      "| Column A | Column B |",
      "| -------- | -------- |",
      "| Value    | Value    |",
      "",
      "```text",
      "code stays",
      "on source lines",
      "```",
      "",
    ].join("\n");

    await renderViewWithPager({
      renderer: "glow",
      content,
      displayPath: "tasks.md",
    }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe([
      "# Heading",
      "",
      "A prose paragraph authored across multiple source lines.",
      "",
      "- A list item authored across multiple source lines.",
      "- A separate item.",
      "",
      "A deliberate hard break.  ",
      "This stays on the next line.",
      "",
      "| Column A | Column B |",
      "| -------- | -------- |",
      "| Value    | Value    |",
      "",
      "```text",
      "code stays",
      "on source lines",
      "```",
      "",
    ].join("\n"));
  });

  it("pre-wraps Glow prose within the terminal gutter using display-cell width", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer: "glow",
      content: [
        "A paragraph with `styled` words authored",
        "across source lines for responsive display.",
        "",
        "- A list item with enough words to wrap onto an indented continuation.",
        "",
      ].join("\n"),
      displayPath: "tasks.md",
      terminalWidth: 42,
    }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe([
      "A paragraph with `styled` words",
      "authored across source lines for",
      "responsive display.",
      "",
      "- A list item with enough words to",
      "  wrap onto an indented continuation.",
      "",
    ].join("\n"));
  });

  it("reflows blockquote prose while preserving its continuation gutter", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer: "glow",
      content: [
        "> A quoted paragraph authored",
        "> across source lines for responsive display.",
        "",
      ].join("\n"),
      displayPath: "inbox.md",
      terminalWidth: 42,
    }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe([
      "> A quoted paragraph authored across",
      "> source lines for responsive display.",
      "",
    ].join("\n"));
  });

  it("preserves fenced code nested inside a blockquote", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "> ```ts",
      "> const value = 1;",
      "> ```",
      "",
    ].join("\n");

    await renderViewWithPager({
      renderer: "glow",
      content,
      displayPath: "notes.md",
      terminalWidth: 42,
    }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe(content);
  });

  it("preserves Setext headings during Glow reflow", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "A Setext heading",
      "================",
      "",
    ].join("\n");

    await renderViewWithPager({
      renderer: "glow",
      content,
      displayPath: "notes.md",
      terminalWidth: 42,
    }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe(content);
  });

  it("inserts transient separators only at provable loose unordered-list boundaries", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "- tight one",
      "- tight two",
      "",
      "  - nested one",
      "",
      "  - nested two",
      "",
      "> - quoted one",
      ">",
      "> - quoted two",
      "",
    ].join("\n");

    await renderViewWithPager({ renderer: "glow", content, displayPath: "notes.md" }, pagerDependencies(run));

    expect(run.mock.calls[0]?.[0].input).toBe([
      "- tight one",
      "- tight two",
      "",
      "  - nested one",
      "",
      "  <!-- arc-view-loose-list -->",
      "  - nested two",
      "",
      "> - quoted one",
      ">",
      "> <!-- arc-view-loose-list -->",
      "> - quoted two",
      "",
    ].join("\n"));
  });

  it("restores each top-level loose-list gap without changing task markers", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "- [ ] first task",
      "",
      "- [x] second task",
      "",
      "- [~] third task",
      "",
    ].join("\n");
    await renderViewWithPager({ renderer: "glow", content, displayPath: "tasks.md" }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].input).toBe([
      "- [ ] first task",
      "",
      "<!-- arc-view-loose-list -->",
      "- [x] second task",
      "",
      "<!-- arc-view-loose-list -->",
      "- [~] third task",
      "",
    ].join("\n"));
  });

  it("restores loose gaps between ARC task entries with nested outcome blocks", async () => {
    let renderedInput = "";
    const content = [
      "- _Goal:_ Parent item",
      "    - `[x]` **1.3.a First nested task**",
      "        - First nested outcome.",
      "",
      "    - `[x]` **1.3.b Second nested task**",
      "        - Second nested outcome.",
      "",
      "- _Outcome:_ Parent outcome",
      "",
    ].join("\n");

    await renderViewWithPager({ renderer: "glow", content, displayPath: "tasks.md" }, {
      environment: { ARC_VIEW_TEST: "true" },
      run: async (input) => {
        renderedInput = input.input;
      },
    });

    expect(renderedInput).toBe([
      "- _Goal:_ Parent item",
      "    - `[x]` **1.3.a First nested task**",
      "        - First nested outcome.",
      "",
      "        <!-- arc-view-loose-list -->",
      "    - `[x]` **1.3.b Second nested task**",
      "        - Second nested outcome.",
      "",
      "        <!-- arc-view-loose-list -->",
      "- _Outcome:_ Parent outcome",
      "",
    ].join("\n"));
  });

  it("leaves fenced and ambiguous multi-block boundaries untouched", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "```md",
      "- apparent item",
      "",
      "- still fenced",
      "```",
      "",
      "- item with another block",
      "",
      "continuation paragraph outside the list",
      "",
      "- later item",
      "",
    ].join("\n");
    await renderViewWithPager({ renderer: "glow", content, displayPath: "notes.md" }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].input).toBe(content);
  });

  it("leaves four-space-indented list-like code untouched", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = [
      "    - code one",
      "",
      "    - code two",
      "",
    ].join("\n");
    await renderViewWithPager({ renderer: "glow", content, displayPath: "notes.md" }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].input).toBe(content);
    expect(run.mock.calls[0]?.[0].input).not.toContain("arc-view-loose-list");
  });

  it("materializes lazy ordered ordinals only in the transient Glow copy", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = ["1. first", "", "1. second", "", "1. third", ""].join("\n");
    await renderViewWithPager({ renderer: "glow", content, displayPath: "notes.md" }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].input).toBe([
      "1. first",
      "",
      "<!-- arc-view-loose-list -->",
      "2. second",
      "",
      "<!-- arc-view-loose-list -->",
      "3. third",
      "",
    ].join("\n"));

    const sequential = ["1. first", "", "2. second", ""].join("\n");
    await renderViewWithPager({ renderer: "glow", content: sequential, displayPath: "notes.md" }, pagerDependencies(run));
    expect(run.mock.calls[1]?.[0].input).toContain("2. second");
  });

  it("confines loose-list adaptation to Glow input", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);
    const content = "- first\n\n- second\n";
    await renderViewWithPager({ renderer: "bat", content, displayPath: "notes.md" }, pagerDependencies(run));
    await renderViewWithPager({ renderer: "plain", content, displayPath: "notes.md" }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].input).toBe(content);
    expect(run.mock.calls[1]?.[0].input).toBe(content);
  });

  it.runIf(glowAvailable)("restores ARC task-list gaps through the real Glow command", async () => {
    const content = [
      "- _Goal:_ Parent item",
      "    - `[x]` **1.3.a First nested task**",
      "        - First nested outcome.",
      "",
      "    - `[x]` **1.3.b Second nested task**",
      "        - Second nested outcome.",
      "",
      "- _Outcome:_ Parent outcome",
      "",
    ].join("\n");
    let status: number | null = null;
    let stdout = "";

    await renderViewWithPager({ renderer: "glow", content, displayPath: "tasks.md" }, {
      environment: { ...process.env, PAGER: "cat" },
      run: async (input) => {
        const result = spawnSync(input.command, [...input.args], {
          input: input.input,
          encoding: "utf8",
          env: input.env,
        });
        status = result.status;
        stdout = result.stdout;
      },
    });

    expect(status).toBe(0);
    const lines = stdout.split("\n");
    const firstOutcome = lines.findIndex((line) => line.includes("First nested outcome"));
    const secondTask = lines.findIndex((line) => line.includes("1.3.b"));
    const secondOutcome = lines.findIndex((line) => line.includes("Second nested outcome"));
    const parentOutcome = lines.findIndex((line) => line.includes("Parent outcome"));
    expect(firstOutcome).toBeGreaterThanOrEqual(0);
    expect(secondTask).toBe(firstOutcome + 2);
    expect(secondOutcome).toBeGreaterThan(secondTask);
    expect(parentOutcome).toBe(secondOutcome + 2);
  });

  it("passes renderer-appropriate anchors to pager modes", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer: "glow",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.R" },
    }, pagerDependencies(run));
    expect(run.mock.calls[0]?.[0].env.LESS).toBe("FRK +/###.*3\\.R");

    await renderViewWithPager({
      renderer: "bat",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.1" },
    }, pagerDependencies(run));
    expect(run.mock.calls[1]?.[0].env.BAT_PAGER).toBe("less -RFK +42");

    await renderViewWithPager({
      renderer: "plain",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.1" },
    }, pagerDependencies(run));
    expect(run.mock.calls[2]?.[0].args).toContain("+42");
  });
});
