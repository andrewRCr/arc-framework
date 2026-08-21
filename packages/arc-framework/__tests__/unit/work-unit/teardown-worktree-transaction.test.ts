import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { createNodeRenameWorktreeTransactionDriver } from "../../../src/lib/work-unit/rename-worktree-transaction.js";
import { createNodeTeardownSelectionReader } from "../../../src/lib/work-unit/teardown-selection.js";
import { createNodeTeardownWorktreeTransactionDriver } from "../../../src/lib/work-unit/teardown-worktree-transaction.js";
import {
  resolveWorktreeOperationLockPath,
  WORKTREE_OPERATION_LOCK_FILENAME,
} from "../../../src/lib/work-unit/worktree-operation-lock.js";

const removals: string[] = [];

afterEach(async () => {
  await Promise.all(removals.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

async function harness() {
  const primary = await mkdtemp(join(tmpdir(), "arc-teardown-primary-"));
  const target = await mkdtemp(join(tmpdir(), "arc-teardown-target-"));
  const commonDir = join(primary, ".git");
  removals.push(primary, target);
  await mkdir(commonDir, { recursive: true });
  let head = "a".repeat(40);
  let detached = false;
  const markerPath = resolveWorktreeMarkerPath(target);
  await mkdir(join(target, ".arc/system/.internal"), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify({
    spawnedByArc: true,
    spawningIdentity: "andrew",
    createdAt: "2026-07-21T00:00:00.000Z",
    wuName: "demo",
  })}\n`);
  const exec: GitExec = async (_command, args) => {
    if (args.join(" ") === "rev-parse --git-common-dir") return { stdout: commonDir };
    if (args.join(" ") === "worktree list --porcelain -z") {
      return {
        stdout: `worktree ${primary}\0HEAD ${"b".repeat(40)}\0branch refs/heads/main\0\0`
          + `worktree ${target}\0HEAD ${head}\0${detached ? "detached" : "branch refs/heads/feat/demo"}\0\0`,
      };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
  const readSelection = createNodeTeardownSelectionReader({ exec, identity: "andrew" });
  const selection = await readSelection({ checkoutPath: target, subject: { kind: "work-unit", name: "demo" } });
  if (selection.kind !== "clear") throw new Error(selection.message);
  return {
    primary,
    commonDir,
    target,
    markerPath,
    selection,
    setHead: (value: string) => { head = value; },
    setDetached: (value: boolean) => { detached = value; },
    exec,
    readSelection,
    driver: createNodeTeardownWorktreeTransactionDriver({ exec, identity: "andrew" }),
  };
}

describe("teardown worktree transaction", () => {
  const stamp = {
    sha: "a".repeat(40),
    at: "2026-08-06T00:00:00.000Z",
    subject: { kind: "work-unit" as const, name: "demo" },
    branch: "feat/demo",
  };

  it("stamps and detaches one exact selection under the shared mutex", async () => {
    const h = await harness();
    await h.driver.husk!({
      expectedSelection: h.selection,
      revalidateLocal: async () => {},
      stamp,
      detachProjection: async () => { h.setDetached(true); },
    });
    expect(await readWorktreeMarker(h.target)).toMatchObject({ kind: "present", marker: { husk: stamp } });
  });

  it("restores the exact marker generation when terminal detach fails", async () => {
    const h = await harness();
    const original = await readFile(h.markerPath);
    await expect(h.driver.husk!({
      expectedSelection: h.selection,
      revalidateLocal: async () => {},
      stamp,
      detachProjection: async () => { throw new Error("detach failed"); },
    })).rejects.toThrow("detach failed");
    expect(await readFile(h.markerPath)).toEqual(original);
  });

  it("refuses a topology race under the mutex before terminal stamping", async () => {
    const h = await harness();
    let detached = false;
    await expect(h.driver.husk!({
      expectedSelection: h.selection,
      revalidateLocal: async () => { h.setHead("c".repeat(40)); },
      stamp,
      detachProjection: async () => { detached = true; },
    })).rejects.toThrow(/selection changed/iu);
    expect(detached).toBe(false);
    const marker = await readWorktreeMarker(h.target);
    expect(marker.kind).toBe("present");
    if (marker.kind === "present") expect("husk" in marker.marker).toBe(false);
  });

  it("refuses a marker race under the mutex before physical retirement", async () => {
    const h = await harness();
    let retired = false;
    await expect(h.driver.retire({
      expectedSelection: h.selection,
      revalidateLocal: async () => {
        await writeFile(h.markerPath, `${JSON.stringify({
          spawnedByArc: true,
          spawningIdentity: "andrew",
          createdAt: "2026-07-21T00:00:00.000Z",
          wuName: "other",
        })}\n`);
      },
      retireProjection: async () => { retired = true; },
    })).rejects.toThrow(/marker|generation|selection/iu);
    expect(retired).toBe(false);
  });

  it("refuses a topology race under the mutex before physical retirement", async () => {
    const h = await harness();
    let retired = false;
    await expect(h.driver.retire({
      expectedSelection: h.selection,
      revalidateLocal: async () => { h.setHead("c".repeat(40)); },
      retireProjection: async () => { retired = true; },
    })).rejects.toThrow(/selection changed/iu);
    expect(retired).toBe(false);
  });

  it("shares one Git-common mutex with rename for same and different checkout targets", async () => {
    const h = await harness();
    const targetLock = await resolveWorktreeOperationLockPath(h.exec, h.target);
    const primaryLock = await resolveWorktreeOperationLockPath(h.exec, h.primary);
    expect(targetLock).toBe(join(h.commonDir, WORKTREE_OPERATION_LOCK_FILENAME));
    expect(primaryLock).toBe(targetLock);
    await writeFile(targetLock, JSON.stringify({ pid: process.pid, acquiredAt: 1, token: "holder" }));
    const lockOptions = () => {
      let now = 0;
      return {
        maxWaitMs: 2,
        now: () => now++,
        sleep: async () => undefined,
        isProcessAlive: () => true,
      };
    };
    const primarySelection = await h.readSelection({
      checkoutPath: h.primary,
      subject: { kind: "work-unit", name: "demo" },
    });
    if (primarySelection.kind !== "clear") throw new Error(primarySelection.message);

    await expect(createNodeTeardownWorktreeTransactionDriver({
      exec: h.exec,
      identity: "andrew",
      lockOptions: lockOptions(),
    }).retire({
      expectedSelection: primarySelection,
      revalidateLocal: async () => {},
      retireProjection: async () => { throw new Error("must not retire"); },
    })).rejects.toThrow(/timed out.*advisory lock/iu);

    await expect(createNodeRenameWorktreeTransactionDriver({
      exec: h.exec,
      lockOptions: lockOptions(),
    }).rename({
      sourceCheckoutPath: h.target,
      targetCheckoutPath: h.target,
      sourceSlug: "demo",
      targetSlug: "renamed",
      expectedHead: h.selection.checkout.head,
    })).rejects.toThrow(/timed out.*advisory lock/iu);
  });

  it("does not turn lock acquisition into teardown eligibility", async () => {
    const h = await harness();
    const lockPath = await resolveWorktreeOperationLockPath(h.exec, h.target);
    let reads = 0;
    let observedLock = false;
    let retired = false;
    const driver = createNodeTeardownWorktreeTransactionDriver({
      exec: h.exec,
      identity: "andrew",
      readSelection: async () => {
        reads += 1;
        if (reads === 1) return h.selection;
        observedLock = (await readFile(lockPath, "utf8")).includes("token");
        return {
          kind: "manual",
          reason: "subject-mismatch",
          message: "The target belongs to a different subject.",
        };
      },
    });

    await expect(driver.retire({
      expectedSelection: h.selection,
      revalidateLocal: async () => {},
      retireProjection: async () => { retired = true; },
    })).rejects.toThrow(/different subject/iu);
    expect(observedLock).toBe(true);
    expect(retired).toBe(false);
  });
});
