import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../src/lib/git/exec.js";
import { renameArtifacts } from "../../../../src/lib/work-unit/mutators/rename-artifacts.js";

function context(entries: Record<string, string[]>) {
  const calls: string[][] = [];
  const removed: string[] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "mv" && args[1] !== undefined) {
      const slash = args[1].lastIndexOf("/");
      const dir = args[1].slice(0, slash);
      const name = args[1].slice(slash + 1);
      entries[dir] = (entries[dir] ?? []).filter((entry) => entry !== name);
    }
    return { stdout: "" };
  };
  return {
    ctx: {
      exec,
      fs: {
        readdir: async (path: string) => entries[path] ?? [],
        mkdir: async () => undefined,
        rmdir: async (path: string) => { removed.push(path); },
      },
    },
    calls,
    removed,
  };
}

describe("renameArtifacts", () => {
  it("moves the exact artifact set through the shared basename map", async () => {
    const { ctx, calls } = context({
      ".arc/active": [
        "spec-sample.md",
        "meta-sample.md",
        "meta-other-sample.md",
        "cohort-sample.md",
        "meta-foreign.md",
      ],
    });

    const result = await renameArtifacts(ctx, {
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      fromDir: ".arc/active",
      toDir: ".arc/active",
    });

    expect(result.moved).toEqual([
      { source: ".arc/active/meta-sample.md", result: ".arc/active/meta-renamed-sample.md" },
      { source: ".arc/active/spec-sample.md", result: ".arc/active/spec-renamed-sample.md" },
    ]);
    expect(calls).toEqual([
      ["mv", ".arc/active/meta-sample.md", ".arc/active/meta-renamed-sample.md"],
      ["mv", ".arc/active/spec-sample.md", ".arc/active/spec-renamed-sample.md"],
    ]);
  });

  it("treats an absent optional artifact set as a no-op", async () => {
    const { ctx, calls } = context({ ".arc/active": ["meta-foreign.md"] });

    await expect(renameArtifacts(ctx, {
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      fromDir: ".arc/active",
      toDir: ".arc/active",
    })).resolves.toEqual({ moved: [] });
    expect(calls).toEqual([]);
  });

  it("renames a flat or cohort-nested backlog leaf without pruning an occupied cohort", async () => {
    const flat = context({
      ".arc/backlog/planned/sample": ["meta-sample.md"],
      ".arc/backlog/planned": [],
    });
    await renameArtifacts(flat.ctx, {
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      fromDir: ".arc/backlog/planned/sample",
      toDir: ".arc/backlog/planned/renamed-sample",
    });
    expect(flat.calls).toContainEqual([
      "mv",
      ".arc/backlog/planned/sample/meta-sample.md",
      ".arc/backlog/planned/renamed-sample/meta-renamed-sample.md",
    ]);
    expect(flat.removed).toEqual([".arc/backlog/planned/sample"]);

    const nested = context({
      ".arc/backlog/planned/group/sample": ["meta-sample.md"],
      ".arc/backlog/planned/group": ["sibling"],
    });
    await renameArtifacts(nested.ctx, {
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
      fromDir: ".arc/backlog/planned/group/sample",
      toDir: ".arc/backlog/planned/group/renamed-sample",
    });
    expect(nested.calls).toContainEqual([
      "mv",
      ".arc/backlog/planned/group/sample/meta-sample.md",
      ".arc/backlog/planned/group/renamed-sample/meta-renamed-sample.md",
    ]);
    expect(nested.removed).toEqual([".arc/backlog/planned/group/sample"]);
  });
});
