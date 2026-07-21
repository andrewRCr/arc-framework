/** Renamed work-unit worktree boundary and compatibility coverage. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  reconcileWorkUnitWorktree,
  type ReconcileWorkUnitWorktreeContext,
} from "../../../../src/lib/work-unit/mutators/reconcile-work-unit-worktree.js";
import { reconcileWorktree } from "../../../../src/lib/work-unit/mutators/reconcile-worktree.js";

describe("reconcileWorkUnitWorktree", () => {
  it("composes default spawn through the collision-aware generic creation boundary", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-work-unit-worktree-"));
    const events: string[] = [];
    const context: ReconcileWorkUnitWorktreeContext = {
      exec: async (command, args) => {
        events.push([command, ...args].join(" "));
        if (args[0] === "rev-parse") return { stdout: ".git/info/exclude\n" };
        return { stdout: "" };
      },
      chdir: () => {},
      fs: {
        pathExists: async (path) => {
          events.push(`path-exists ${path}`);
          return false;
        },
        directoryExists: async () => false,
        copyDirectory: async () => {},
        readFile: async () => "",
        writeFile: async () => {},
        mkdir: async () => {},
        readDir: async () => [],
      },
    };

    const result = await reconcileWorkUnitWorktree(context, {
      mutation: "spawn",
      branch: "feat/demo",
      base: "main",
      locationTemplate: join(root, "{repo}.{name}"),
      primaryWorktreePath: join(root, "repo"),
      repo: "repo",
      wuName: "demo",
      spawningIdentity: "andrew",
    });

    const worktreePath = join(root, "repo.demo");
    expect(result).toMatchObject({ mutation: "spawn", worktreePath });
    expect(events.slice(0, 2)).toEqual([
      `path-exists ${worktreePath}`,
      `git worktree add ${worktreePath} -b feat/demo main`,
    ]);
    await rm(root, { recursive: true, force: true });
  });

  it("keeps the old symbol as the exact compatibility alias", () => {
    expect(reconcileWorktree).toBe(reconcileWorkUnitWorktree);
  });
});
