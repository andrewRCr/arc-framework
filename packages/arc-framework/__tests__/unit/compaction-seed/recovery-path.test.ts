import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  resolveRecoverySeedCheckout,
  resolveRecoverySeedPath,
} from "../../../src/lib/compaction-seed/recovery-path.js";
import type { CompactionSeed } from "../../../src/lib/compaction-seed/schema.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const primary = join(tmpdir(), "arc-recovery-path-primary");
const linked = `${primary}.linked`;
const head = "a".repeat(40);

describe("recovery seed path resolution", () => {
  it("uses the invocation checkout's seed when no explicit path is supplied", async () => {
    const exec = vi.fn<GitExec>();

    await expect(resolveRecoverySeedPath({
      cwd: primary,
      identity: "andrew",
      exec,
    })).resolves.toEqual({
      ok: true,
      path: join(primary, ".arc", "user", "andrew", ".internal", "compaction-seed.json"),
      source: "checkout-local",
    });
    expect(exec).not.toHaveBeenCalled();
  });

  it("accepts an explicit seed path owned by one registered linked checkout", async () => {
    const exec = worktreeExec();
    const seedPath = join(linked, ".arc", "user", "andrew", ".internal", "compaction-seed.json");

    await expect(resolveRecoverySeedPath({
      cwd: primary,
      identity: "andrew",
      exec,
      requestedPath: seedPath,
    })).resolves.toEqual({ ok: true, path: seedPath, source: "explicit" });
  });

  it("returns a locus diagnostic for an explicit path outside registered checkouts", async () => {
    const exec = worktreeExec();
    const missing = join(
      tmpdir(),
      "missing-worktree",
      ".arc",
      "user",
      "andrew",
      ".internal",
      "compaction-seed.json",
    );

    await expect(resolveRecoverySeedPath({
      cwd: primary,
      identity: "andrew",
      exec,
      requestedPath: missing,
    })).resolves.toMatchObject({
      ok: false,
      message: "recovery seed locus is not a registered checkout",
      detail: { seedPath: missing },
    });
  });

  it("binds the parsed seed path and locus to the same registered checkout", async () => {
    const exec = worktreeExec();
    const seedPath = join(linked, ".arc", "user", "andrew", ".internal", "compaction-seed.json");
    const seed = { locus: { checkoutPath: linked, parentCheckoutPath: null } } as CompactionSeed;

    await expect(resolveRecoverySeedCheckout({
      seedPath,
      seed,
      identity: "andrew",
      exec,
    })).resolves.toEqual({ ok: true, checkoutPath: linked });
  });
});

function worktreeExec(): GitExec {
  const porcelain = [
    `worktree ${primary}`,
    `HEAD ${head}`,
    "branch refs/heads/main",
    "",
    `worktree ${linked}`,
    `HEAD ${head}`,
    "branch refs/heads/chore/recover",
    "",
    "",
  ].join("\0");
  return async (_command, args) => {
    if (args.join(" ") !== "worktree list --porcelain -z") {
      throw new Error(`Unexpected git invocation: ${args.join(" ")}`);
    }
    return { stdout: porcelain };
  };
}
