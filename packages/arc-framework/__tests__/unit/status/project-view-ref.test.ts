/**
 * Unit tests for the git-ref-backed project-view snapshot used by mutating
 * lifecycle dispatch. The adapter must expose one coherent ref tree and fail
 * closed when either enumeration or a listed meta read fails.
 */

import { describe, expect, it, vi } from "vitest";

import { createProjectViewRefSnapshot } from "../../../src/lib/status/project-view-ref.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

describe("createProjectViewRefSnapshot", () => {
  it("exposes nested lifecycle metas from one pinned ref", async () => {
    const path = ".arc/backlog/planned/widget/meta-widget.md";
    const unrelated = ".arc/backlog/planned/elsewhere/meta-elsewhere.md";
    const exec: GitExec = vi.fn(async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${path}\n${unrelated}\n`, stderr: "" };
      if (args[0] === "show" && args[1] === `abc123:${path}`) {
        return { stdout: "# Metadata: widget\n", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });

    const snapshot = await createProjectViewRefSnapshot({ cwd: "/repo", exec, ref: "abc123", slug: "widget" });

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    const planned = await snapshot.fs.readdir("/repo/.arc/backlog/planned");
    expect(planned.map((entry) => [entry.name, entry.isDirectory()])).toEqual([["widget", true]]);
    await expect(snapshot.fs.readFile(`/repo/${path}`)).resolves.toBe("# Metadata: widget\n");
    expect(exec).not.toHaveBeenCalledWith("git", ["show", `abc123:${unrelated}`], expect.anything());
  });

  it("fails closed when the ref tree cannot be enumerated", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("missing object");
    });

    await expect(createProjectViewRefSnapshot({
      cwd: "/repo",
      exec,
      ref: "bad-ref",
      slug: "widget",
    })).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/enumerate.*bad-ref/iu),
    });
  });

  it("fails closed when a listed meta cannot be read", async () => {
    const path = ".arc/active/meta-widget.md";
    const exec: GitExec = vi.fn(async (_cmd, args) => {
      if (args[0] === "ls-tree") return { stdout: `${path}\n`, stderr: "" };
      throw new Error("blob missing");
    });

    await expect(createProjectViewRefSnapshot({
      cwd: "/repo",
      exec,
      ref: "abc123",
      slug: "widget",
    })).resolves.toMatchObject({
      ok: false,
      reason: expect.stringMatching(/read.*meta-widget/iu),
    });
  });
});
