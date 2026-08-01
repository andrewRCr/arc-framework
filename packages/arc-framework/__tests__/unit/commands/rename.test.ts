/**
 * Checkout coordinates the rename command hands to the locus rekey.
 *
 * The rekey is keyed by checkout path, so which paths this resolution reports decides whether an
 * interrupted rename can still find the record it left behind. Git is mocked at the exec seam.
 */

import { describe, expect, it } from "vitest";

import { resolveRekeyCheckout } from "../../../src/commands/rename.js";
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

describe("resolveRekeyCheckout", () => {
  it("rekeys a landed move from the path its record is still keyed under", async () => {
    await expect(resolveRekeyCheckout(roster(MOVED), {
      status: "already-moved",
      worktreePath: MOVED,
      sourceWorktreePath: SOURCE,
    })).resolves.toEqual({ from: SOURCE, to: MOVED, expectedHead: HEAD });
  });

  it("carries a pending move from its source to its destination", async () => {
    await expect(resolveRekeyCheckout(roster(SOURCE), {
      status: "move",
      from: SOURCE,
      to: MOVED,
    })).resolves.toEqual({ from: SOURCE, to: MOVED, expectedHead: HEAD });
  });

  it("resolves an in-place subject to the primary checkout", async () => {
    await expect(resolveRekeyCheckout(roster(MOVED), { status: "in-place" }))
      .resolves.toEqual({ from: PRIMARY, to: PRIMARY, expectedHead: "b".repeat(40) });
  });

  it("keeps one path for a deferred self-move so only the subject rekeys", async () => {
    await expect(resolveRekeyCheckout(roster(SOURCE), {
      status: "deferred-self-move",
      from: SOURCE,
      to: MOVED,
    })).resolves.toEqual({ from: SOURCE, to: SOURCE, expectedHead: HEAD });
  });

  it("keeps one path when no registered checkout matches the renamed slug", async () => {
    await expect(resolveRekeyCheckout(roster(MOVED), {
      status: "unmatched",
      worktreePath: MOVED,
    })).resolves.toEqual({ from: MOVED, to: MOVED, expectedHead: HEAD });
  });

  it("reports no checkout to rekey when the subject is unregistered", async () => {
    await expect(resolveRekeyCheckout(roster(MOVED), {
      status: "unmatched",
      worktreePath: "/work/project.absent",
    })).resolves.toBeNull();
  });
});
