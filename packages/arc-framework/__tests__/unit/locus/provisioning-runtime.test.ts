/** Production provisioning adapter contracts over real exact-generation storage. */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { createNodeProvisioningDependencies } from "../../../src/lib/locus/provisioning-runtime.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("node provisioning runtime", () => {
  it("acquires the checkout-derived lock and revalidates a clean primary target", async () => {
    const primary = await mkdtemp(join(tmpdir(), "arc-provision-runtime-"));
    roots.push(primary);
    const head = "a".repeat(40);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "worktree") {
        return { stdout: `worktree ${primary}\0HEAD ${head}\0branch refs/heads/main\0\0` };
      }
      if (args[0] === "status") return { stdout: "" };
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "main\n" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
    const runtime = createNodeProvisioningDependencies({
      exec,
      identity: "andrew",
      anchor: {
        kind: "process",
        pid: 42,
        startToken: "start",
        inspector: "fixture",
        selector: "codex",
      },
      inspector: { kind: "fixture", inspect: async () => ({ kind: "absent" }) },
      pathFlavor: "posix",
      base: "main",
      branch: "chore/sample",
      postCreateScript: "",
      registeredHarnessDirs: "",
    });

    const acquired = await runtime.acquireRecordLock(primary);
    expect(acquired.kind).toBe("acquired");
    if (acquired.kind !== "acquired") throw new Error("fixture lock failed");
    await expect(runtime.revalidateTarget({
      proposal: {
        kind: "proposal",
        allocation: { kind: "primary", checkoutPath: primary },
        subject: { kind: "errand", key: "sample", claimId: "c".repeat(32) },
      },
      checkoutPath: primary,
      handle: acquired.handle,
    })).resolves.toEqual({ kind: "ready" });
    await expect(runtime.releaseRecordLock(acquired.handle)).resolves.toBeUndefined();
  });
});
