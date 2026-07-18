/**
 * Unit tests for renderer selection and pager composition.
 */

import { describe, expect, it, vi } from "vitest";

import {
  detectViewRenderer,
  renderViewWithPager,
  resolveViewRenderer,
  type PagerProcessRunner,
} from "../../../src/lib/view-renderer.js";

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
    ["glow", "glow", ["--pager", "--width", "0", "-"]],
    ["bat", "bat", ["--paging=always", "--style=plain", "--language=md", "--file-name", "tasks.md", "-"]],
    ["plain", "less", ["-R", "-F", "-X"]],
  ] as const)("composes %s through its pager mode", async (renderer, command, args) => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer,
      content: "# Tasks\n",
      displayPath: "tasks.md",
    }, { run });

    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      command,
      args,
      input: "# Tasks\n",
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
    }, { run });

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
    }, { run });

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
    }, { run });

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
    }, { run });

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
    }, { run });

    expect(run.mock.calls[0]?.[0].input).toBe(content);
  });

  it("passes renderer-appropriate anchors to pager modes", async () => {
    const run = vi.fn<PagerProcessRunner>().mockResolvedValue(undefined);

    await renderViewWithPager({
      renderer: "glow",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.R" },
    }, { run });
    expect(run.mock.calls[0]?.[0].env.LESS).toBe("FRX +/###.*3\\.R");

    await renderViewWithPager({
      renderer: "bat",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.1" },
    }, { run });
    expect(run.mock.calls[1]?.[0].env.BAT_PAGER).toBe("less -RFX +42");

    await renderViewWithPager({
      renderer: "plain",
      content: "# Tasks\n",
      displayPath: "tasks.md",
      anchor: { line: 42, id: "3.1" },
    }, { run });
    expect(run.mock.calls[2]?.[0].args).toContain("+42");
  });
});
