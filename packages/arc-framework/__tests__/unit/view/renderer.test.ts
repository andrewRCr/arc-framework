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
    ["glow", "glow", ["--pager", "-"]],
    ["bat", "bat", ["--paging=always", "--language=md", "--file-name", "tasks.md", "-"]],
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
});
