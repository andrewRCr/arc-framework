/** Tests for marker/topology-bound worktree rename transactions. */

import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  readWorktreeMarkerGeneration,
  writeWorktreeMarker,
  writeWorktreeOwnershipMarker,
} from "../../../src/lib/git/worktree-marker.js";
import { AdvisoryLockTimeoutError } from "../../../src/lib/advisory-lock.js";
import {
  createNodeRenameWorktreeTransactionDriver,
  type RenameWorktreeTransactionRequest,
} from "../../../src/lib/work-unit/rename-worktree-transaction.js";
import {
  resolveWorktreeOperationLockPath,
  WORKTREE_OPERATION_LOCK_FILENAME,
} from "../../../src/lib/work-unit/worktree-operation-lock.js";

const HEAD = "a".repeat(40);
const OTHER_HEAD = "c".repeat(40);
const CREATED_AT = Date.parse("2026-07-24T00:00:00.000Z");
const removals: string[] = [];

afterEach(async () => {
  await Promise.all(removals.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

interface RenameHarness {
  readonly source: string;
  readonly target: string;
  readonly commonDir: string;
  readonly exec: GitExec;
  readonly request: RenameWorktreeTransactionRequest;
  readonly setRegisteredHead: (head: string) => void;
  readonly setScanHook: (hook: ((count: number) => Promise<void> | void) | null) => void;
  readonly setCommonDirHook: (hook: (() => Promise<void> | void) | null) => void;
  readonly move: (options?: { throwAfter?: boolean; postHead?: string }) => RenameWorktreeTransactionRequest["move"];
}

async function harness(options: { marker?: "old" | "new" | "foreign" | "absent" } = {}): Promise<RenameHarness> {
  const root = await mkdtemp(join(tmpdir(), "arc-rename-transaction-"));
  const primary = join(root, "primary");
  const source = join(root, "project.old-name");
  const target = join(root, "project.new-name");
  const commonDir = join(root, "git-common");
  removals.push(root);
  await Promise.all([mkdir(primary, { recursive: true }), mkdir(source, { recursive: true }), mkdir(commonDir)]);

  const markerName = options.marker ?? "old";
  if (markerName !== "absent") {
    await writeWorktreeOwnershipMarker(source, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: markerName === "foreign" ? "other-name" : `${markerName}-name` },
      spawningIdentity: "andrew",
      now: CREATED_AT,
    });
  }

  let registeredPath = source;
  let registeredHead = HEAD;
  let scanCount = 0;
  let scanHook: ((count: number) => Promise<void> | void) | null = null;
  let commonDirHook: (() => Promise<void> | void) | null = null;
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "worktree" && args[1] === "list") {
      scanCount += 1;
      await scanHook?.(scanCount);
      return {
        stdout: `worktree ${primary}\0HEAD ${"b".repeat(40)}\0branch refs/heads/main\0\0`
          + `worktree ${registeredPath}\0HEAD ${registeredHead}\0branch refs/heads/feat/new-name\0\0`,
      };
    }
    if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
      const hook = commonDirHook;
      commonDirHook = null;
      await hook?.();
      return { stdout: `${commonDir}\n` };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };

  const move = (moveOptions: { throwAfter?: boolean; postHead?: string } = {}) => ({
    apply: async () => {
      await rename(source, target);
      registeredPath = target;
      registeredHead = moveOptions.postHead ?? HEAD;
      if (moveOptions.throwAfter === true) throw new Error("move failed after relocation");
    },
    rollback: async () => {
      await rename(target, source);
      registeredPath = source;
      registeredHead = HEAD;
    },
  });

  return {
    source,
    target,
    commonDir,
    exec,
    request: {
      sourceCheckoutPath: source,
      targetCheckoutPath: target,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    },
    setRegisteredHead: (head) => { registeredHead = head; },
    setScanHook: (hook) => { scanHook = hook; },
    setCommonDirHook: (hook) => { commonDirHook = hook; },
    move,
  };
}

async function markerBytes(path: string): Promise<Buffer> {
  const marker = await readWorktreeMarkerGeneration(path);
  if (marker.kind !== "present") throw new Error(`expected marker at ${path}`);
  return marker.bytes;
}

describe("worktree rename transaction", () => {
  it("renames an owned marker and returns its exact generation", async () => {
    const h = await harness();
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: h.move(),
      renameMovePending: null,
    });

    expect(outcome).toMatchObject({ kind: "renamed", checkoutPath: h.target });
    const marker = await readWorktreeMarkerGeneration(h.target);
    expect(marker).toMatchObject({
      kind: "present",
      marker: { wuName: "new-name", createdFor: { kind: "work-unit", name: "new-name" } },
    });
    if (marker.kind !== "present" || outcome.kind === "refused" || outcome.kind === "unmanaged") return;
    expect(outcome.markerGeneration).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("refuses a topology race under the mutex before mutating marker or path", async () => {
    const h = await harness();
    const original = await markerBytes(h.source);
    h.setScanHook((count) => {
      if (count === 2) h.setRegisteredHead(OTHER_HEAD);
    });
    let moved = false;

    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: {
        apply: async () => { moved = true; },
        rollback: async () => undefined,
      },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "roster-changed" });
    expect(moved).toBe(false);
    expect(await markerBytes(h.source)).toEqual(original);
  });

  it("refuses an exact marker-generation race under the mutex before physical mutation", async () => {
    const h = await harness();
    h.setCommonDirHook(async () => {
      await writeWorktreeOwnershipMarker(h.source, {
        createdByArc: true,
        createdFor: { kind: "work-unit", name: "old-name" },
        spawningIdentity: "andrew",
        now: CREATED_AT + 1,
      });
    });
    let moved = false;

    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: {
        apply: async () => { moved = true; },
        rollback: async () => undefined,
      },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "generation-changed" });
    expect(moved).toBe(false);
  });

  it("refuses a topology race after marker replacement and restores exact marker bytes", async () => {
    const h = await harness();
    const original = await markerBytes(h.source);
    h.setScanHook((count) => {
      if (count === 3) h.setRegisteredHead(OTHER_HEAD);
    });
    let moved = false;

    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: {
        apply: async () => { moved = true; },
        rollback: async () => undefined,
      },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "roster-changed" });
    expect(moved).toBe(false);
    expect(await markerBytes(h.source)).toEqual(original);
  });

  it("refuses foreign marker ownership before physical mutation", async () => {
    const h = await harness({ marker: "foreign" });
    let moved = false;
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: {
        apply: async () => { moved = true; },
        rollback: async () => undefined,
      },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "role-conflict" });
    expect(moved).toBe(false);
  });

  it("restores exact marker bytes and source path when a move throws after relocation", async () => {
    const h = await harness();
    const original = await markerBytes(h.source);
    await expect(createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: h.move({ throwAfter: true }),
    })).rejects.toThrow("move failed after relocation");

    expect(await markerBytes(h.source)).toEqual(original);
    await expect(readFile(h.target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back marker and path when post-move topology proof changes", async () => {
    const h = await harness();
    const original = await markerBytes(h.source);
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: h.move({ postHead: OTHER_HEAD }),
    });

    expect(outcome).toEqual({ kind: "refused", reason: "roster-changed" });
    expect(await markerBytes(h.source)).toEqual(original);
    await expect(readFile(h.target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back the path and preserves a raced post-move marker generation", async () => {
    const h = await harness();
    const physicalMove = h.move();
    if (physicalMove === undefined) throw new Error("missing move fixture");
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: {
        apply: async () => {
          await physicalMove.apply();
          await writeWorktreeOwnershipMarker(h.target, {
            createdByArc: true,
            createdFor: { kind: "work-unit", name: "new-name" },
            spawningIdentity: "andrew",
            now: CREATED_AT + 1,
          });
        },
        rollback: physicalMove.rollback,
      },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "generation-changed" });
    expect(await readWorktreeMarkerGeneration(h.source)).toMatchObject({
      kind: "present",
      marker: { createdAt: new Date(CREATED_AT + 1).toISOString() },
    });
    await expect(readFile(h.target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("leaves sibling transient parent paths untouched", async () => {
    const h = await harness();
    const sibling = join(h.commonDir, "sibling");
    await mkdir(sibling);
    await writeWorktreeMarker(sibling, {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug: "warm-child", claimId: "c".repeat(32) },
      provisioning: "ready",
      spawningIdentity: "andrew",
      createdAt: new Date(CREATED_AT).toISOString(),
      parentCheckoutPath: h.source,
    });
    const original = await markerBytes(sibling);

    await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      move: h.move(),
    });

    expect(await markerBytes(sibling)).toEqual(original);
  });

  it("records an exact deferred self-move without changing the checkout path", async () => {
    const h = await harness();
    const pending = {
      oldSlug: "old-name",
      newSlug: "new-name",
      branch: "feat/new-name",
      head: HEAD,
      from: h.source,
      to: h.target,
    };
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      targetCheckoutPath: h.source,
      renameMovePending: pending,
    });

    expect(outcome).toMatchObject({ kind: "renamed", checkoutPath: h.source });
    expect(await readWorktreeMarkerGeneration(h.source)).toMatchObject({
      kind: "present",
      marker: { createdFor: { kind: "work-unit", name: "new-name" }, renameMovePending: pending },
    });
  });

  it("accepts a landed move idempotently from target topology and marker generation", async () => {
    const h = await harness({ marker: "new" });
    const physicalMove = h.move();
    if (physicalMove === undefined) throw new Error("missing move fixture");
    await physicalMove.apply();

    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      renameMovePending: null,
    });

    expect(outcome).toMatchObject({ kind: "idempotent", checkoutPath: h.target });
  });

  it("times out on the canonical Git-common mutex without changing evidence or checkout state", async () => {
    const h = await harness();
    const original = await markerBytes(h.source);
    const lockPath = await resolveWorktreeOperationLockPath(h.exec, h.source);
    expect(lockPath).toBe(join(h.commonDir, WORKTREE_OPERATION_LOCK_FILENAME));
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, acquiredAt: 1, token: "holder" }));
    let now = 0;

    await expect(createNodeRenameWorktreeTransactionDriver({
      exec: h.exec,
      lockOptions: {
        maxWaitMs: 2,
        now: () => now++,
        sleep: async () => undefined,
        isProcessAlive: () => true,
      },
    }).rename({ ...h.request, move: h.move() })).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);

    expect(await markerBytes(h.source)).toEqual(original);
    await expect(readFile(h.target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports an unmarked in-place checkout without minting authority", async () => {
    const h = await harness({ marker: "absent" });
    const outcome = await createNodeRenameWorktreeTransactionDriver({ exec: h.exec }).rename({
      ...h.request,
      targetCheckoutPath: h.source,
    });

    expect(outcome).toEqual({ kind: "unmanaged", checkoutPath: h.source, markerGeneration: null });
  });
});
