/**
 * Checkout coordinates the rename command hands to the marker/topology transaction.
 *
 * Which paths this resolution reports decides whether an interrupted rename can prove its landed
 * or pending physical state. Git is mocked at the exec seam.
 */

import { describe, expect, it } from "vitest";

import { resolveRenameCheckoutCoordinates } from "../../../src/commands/rename.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const HEAD = "a".repeat(40);
const PRIMARY = "/work/project";
const MOVED = "/work/project.new-name";
const SOURCE = "/work/project.old-name";

function roster(registered: string): GitExec {
  return async (_command, args) => {
    if (args[0] === "worktree" && args[1] === "list") {
      return {
        stdout: `worktree ${PRIMARY}\0HEAD ${"b".repeat(40)}\0branch refs/heads/main\0\0`
          + `worktree ${registered}\0HEAD ${HEAD}\0branch refs/heads/feat/new-name\0\0`,
      };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("resolveRenameCheckoutCoordinates", () => {
  it("retains both source and destination coordinates for a landed move", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(MOVED), {
      status: "already-moved",
      worktreePath: MOVED,
      sourceWorktreePath: SOURCE,
    })).resolves.toEqual({ from: SOURCE, to: MOVED, expectedHead: HEAD });
  });

  it("carries a pending move from its source to its destination", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(SOURCE), {
      status: "move",
      from: SOURCE,
      to: MOVED,
    })).resolves.toEqual({ from: SOURCE, to: MOVED, expectedHead: HEAD });
  });

  it("resolves an in-place subject to the primary checkout", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(MOVED), { status: "in-place" }))
      .resolves.toEqual({ from: PRIMARY, to: PRIMARY, expectedHead: "b".repeat(40) });
  });

  it("keeps one path for a deferred self-move so only the marker changes", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(SOURCE), {
      status: "deferred-self-move",
      from: SOURCE,
      to: MOVED,
    })).resolves.toEqual({ from: SOURCE, to: SOURCE, expectedHead: HEAD });
  });

  it("keeps one path when no registered checkout matches the renamed slug", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(MOVED), {
      status: "unmatched",
      worktreePath: MOVED,
    })).resolves.toEqual({ from: MOVED, to: MOVED, expectedHead: HEAD });
  });

  it("reports no checkout coordinates when the subject is unregistered", async () => {
    await expect(resolveRenameCheckoutCoordinates(roster(MOVED), {
      status: "unmatched",
      worktreePath: "/work/project.absent",
    })).resolves.toBeNull();
  });
});
