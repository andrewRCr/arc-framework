/**
 * Unit tests for the renamed-work-unit locus rekey transaction. Git is mocked at the exec seam and
 * the record store is real (temp dirs), so lock placement, generation checks, and the persisted
 * rekey are asserted against actual files rather than a stubbed store.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import { createPlatformProcessInspector } from "../../../src/lib/locus/platform-inspectors.js";
import { mintLocusRecord, readLocusRecord } from "../../../src/lib/locus/record-store.js";
import { locusLockPath, locusRecordPath, type LocusRoot } from "../../../src/lib/locus/root.js";
import type { LocusAnchor, LocusRecordV1 } from "../../../src/lib/locus/schema/index.js";
import { selectLocusMutationAnchor } from "../../../src/lib/locus/mutation-anchor.js";
import { createNodeRenameLocusDriver } from "../../../src/lib/work-unit/rename-locus.js";

const PATH_FLAVOR = process.platform === "win32" ? "windows" : "posix";
const HEAD = "a".repeat(40);
const removals: string[] = [];

afterEach(async () => {
  await Promise.all(removals.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

/**
 * The exact anchor the driver selects, so a lease built from it reads as this session's own.
 *
 * Ownership is full-anchor equality (as in the owned-role pop), and a real lease is attached by an
 * earlier operation in the same session through this same selection — so reproducing it here is
 * what makes the entering-anchor case realistic rather than merely live.
 */
async function enteringAnchor(): Promise<Extract<LocusAnchor, { kind: "process" }>> {
  return selectLocusMutationAnchor(createPlatformProcessInspector(), "test anchor");
}

/** A PID that cannot be running, so its anchor verifies as conclusively dead. */
function deadAnchor(): Extract<LocusAnchor, { kind: "process" }> {
  return {
    kind: "process",
    pid: 2 ** 22 - 1,
    startToken: "0".repeat(32),
    inspector: createPlatformProcessInspector().kind,
    selector: "vitest",
  };
}

async function harness(options: {
  lease?: (sourcePath: string) => LocusRecordV1["lease"];
  slug?: string;
  moved?: boolean;
} = {}) {
  const primary = await mkdtemp(join(tmpdir(), "arc-rename-primary-"));
  const source = await mkdtemp(join(tmpdir(), "arc-rename-source-"));
  const targetPath = `${source}.renamed`;
  removals.push(primary, source, targetPath);
  let registeredPath = source;
  const exec: GitExec = async (_command, args) => {
    if (args[0] !== "worktree" || args[1] !== "list") throw new Error(`unexpected git call: ${args.join(" ")}`);
    return {
      stdout: `worktree ${primary}\0HEAD ${"b".repeat(40)}\0branch refs/heads/main\0\0`
        + `worktree ${registeredPath}\0HEAD ${HEAD}\0branch refs/heads/feat/demo\0\0`,
    };
  };
  const root: LocusRoot = {
    primaryPath: primary,
    userRoot: join(primary, ".arc", "user", "andrew"),
    lociRoot: join(primary, ".arc", "user", "andrew", ".internal", "loci"),
    locksRoot: join(primary, ".arc", "user", "andrew", ".internal", "loci", ".locks"),
  };
  const sourceIdentity = deriveLocusRecordId(source, PATH_FLAVOR);
  const targetIdentity = deriveLocusRecordId(options.moved === false ? source : targetPath, PATH_FLAVOR);
  const sourceRecordPath = locusRecordPath(root, sourceIdentity.digest);
  const created = await mintLocusRecord({
    path: sourceRecordPath,
    record: {
      schemaVersion: 1,
      recordId: sourceIdentity.recordId,
      checkoutPath: source,
      role: {
        kind: "work-unit",
        subject: { kind: "work-unit", key: options.slug ?? "old-name", claimId: null },
        establishedAt: "2026-07-24T00:00:00.000Z",
        parentCheckoutPath: null,
        originEntry: null,
      },
      lease: options.lease?.(source) ?? null,
    },
  });
  if (created.kind !== "created") throw new Error("fixture record already exists");
  return {
    source,
    targetPath,
    sourceIdentity,
    targetIdentity,
    sourceRecordPath,
    targetRecordPath: locusRecordPath(root, targetIdentity.digest),
    sourceLockPath: locusLockPath(root, sourceIdentity.digest),
    targetLockPath: locusLockPath(root, targetIdentity.digest),
    driver: createNodeRenameLocusDriver({ exec, identity: "andrew" }),
    registerMoved: () => { registeredPath = targetPath; },
  };
}

async function readRecordAt(path: string, digest: string) {
  return readLocusRecord({ path, expectedDigest: digest, pathFlavor: PATH_FLAVOR });
}

function leaseFor(anchor: Extract<LocusAnchor, { kind: "process" }>, sessionHomePath: string) {
  return {
    leaseId: "l".repeat(32),
    anchor,
    sessionHomePath,
    attachedAt: "2026-07-24T00:00:00.000Z",
    heartbeatAt: "2026-07-24T00:00:00.000Z",
  };
}

describe("renamed work-unit locus rekey", () => {
  it("rekeys the subject in place when the checkout does not move", async () => {
    const h = await harness({ moved: false });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.source,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: h.sourceIdentity.recordId });
    const record = await readRecordAt(h.sourceRecordPath, h.sourceIdentity.digest);
    expect(record.kind).toBe("valid");
    if (record.kind !== "valid") return;
    expect(record.record.role.subject).toMatchObject({ key: "new-name" });
    expect(record.record.checkoutPath).toBe(h.source);
    expect(record.record.lease).toBeNull();
  });

  it("mints at the new path digest and removes the superseded record on a move", async () => {
    const h = await harness();

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { h.registerMoved(); },
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: h.targetIdentity.recordId });
    const moved = await readRecordAt(h.targetRecordPath, h.targetIdentity.digest);
    expect(moved.kind).toBe("valid");
    if (moved.kind !== "valid") return;
    expect(moved.record.checkoutPath).toBe(h.targetPath);
    expect(moved.record.role.subject).toMatchObject({ key: "new-name" });
    await expect(readFile(h.sourceRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("performs the physical move under both record locks", async () => {
    const h = await harness();
    let lockedDuringMove: readonly boolean[] = [];

    await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => {
        lockedDuringMove = await Promise.all([
          readFile(h.sourceLockPath, "utf8").then((text) => text.includes('"token"'), () => false),
          readFile(h.targetLockPath, "utf8").then((text) => text.includes('"token"'), () => false),
        ]);
        h.registerMoved();
      },
    });

    expect(lockedDuringMove).toEqual([true, true]);
    await expect(readFile(h.sourceLockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(h.targetLockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reaps a conclusively dead lease rather than carrying it to the new key", async () => {
    const h = await harness({ lease: () => leaseFor(deadAnchor(), "/somewhere/else") });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { h.registerMoved(); },
    });

    expect(outcome).toMatchObject({ kind: "rekeyed" });
    const moved = await readRecordAt(h.targetRecordPath, h.targetIdentity.digest);
    if (moved.kind !== "valid") throw new Error("rekeyed record is unreadable");
    expect(moved.record.lease).toBeNull();
  });

  it("rebases an entering-anchor lease onto the new checkout path", async () => {
    const anchor = await enteringAnchor();
    const h = await harness({ lease: (sourcePath) => leaseFor(anchor, sourcePath) });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { h.registerMoved(); },
    });

    expect(outcome).toMatchObject({ kind: "rekeyed" });
    const moved = await readRecordAt(h.targetRecordPath, h.targetIdentity.digest);
    if (moved.kind !== "valid") throw new Error("rekeyed record is unreadable");
    expect(moved.record.lease?.sessionHomePath).toBe(h.targetPath);
  });

  it("refuses a live lease held by another anchor without mutating either record", async () => {
    const foreign = { ...(await enteringAnchor()), selector: "other-session" };
    const h = await harness({ lease: (sourcePath) => leaseFor(foreign, sourcePath) });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { throw new Error("move must not run for a refused rekey"); },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "lease-live" });
    const untouched = await readRecordAt(h.sourceRecordPath, h.sourceIdentity.digest);
    expect(untouched.kind).toBe("valid");
    await expect(readFile(h.targetRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses unverifiable liveness", async () => {
    const h = await harness({
      lease: (sourcePath) => leaseFor({ ...deadAnchor(), inspector: "unsupported-inspector" }, sourcePath),
    });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { throw new Error("move must not run for a refused rekey"); },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "lease-unknown" });
  });

  it("refuses a subject that does not match the rename source", async () => {
    const h = await harness({ slug: "unrelated", moved: false });

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.source,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "refused", reason: "role-conflict" });
  });

  it("refuses when the roster generation changed under lock", async () => {
    const h = await harness();

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: "c".repeat(40),
    });

    expect(outcome).toEqual({ kind: "refused", reason: "roster-changed" });
  });

  it("completes idempotently when the rekey already landed", async () => {
    const h = await harness();
    const first = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { h.registerMoved(); },
    });
    expect(first).toMatchObject({ kind: "rekeyed" });

    const second = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { throw new Error("move must not re-run"); },
    });

    expect(second).toEqual({ kind: "idempotent", recordId: h.targetIdentity.recordId });
  });

  it("rekeys a resumed rename whose physical move already landed", async () => {
    const h = await harness();
    h.registerMoved();

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: h.targetIdentity.recordId });
    const moved = await readRecordAt(h.targetRecordPath, h.targetIdentity.digest);
    if (moved.kind !== "valid") throw new Error("rekeyed record is unreadable");
    expect(moved.record.checkoutPath).toBe(h.targetPath);
    await expect(readFile(h.sourceRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("finishes the path rekey after a deferred self-rename already changed the subject", async () => {
    const h = await harness({ slug: "new-name" });
    h.registerMoved();

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: h.targetIdentity.recordId });
    const moved = await readRecordAt(h.targetRecordPath, h.targetIdentity.digest);
    expect(moved).toMatchObject({
      kind: "valid",
      record: { checkoutPath: h.targetPath, role: { subject: { key: "new-name" } } },
    });
    await expect(readFile(h.sourceRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a colliding target record before moving the worktree", async () => {
    const h = await harness();
    const collision = await mintLocusRecord({
      path: h.targetRecordPath,
      record: {
        schemaVersion: 1,
        recordId: h.targetIdentity.recordId,
        checkoutPath: h.targetPath,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "unrelated", claimId: null },
          establishedAt: "2026-07-24T00:00:00.000Z",
          parentCheckoutPath: null,
          originEntry: null,
        },
        lease: null,
      },
    });
    if (collision.kind !== "created") throw new Error("fixture target record already exists");
    let moved = false;

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
      moveWorktree: async () => { moved = true; h.registerMoved(); },
    });

    expect(outcome).toEqual({ kind: "refused", reason: "role-conflict" });
    expect(moved).toBe(false);
    const source = await readRecordAt(h.sourceRecordPath, h.sourceIdentity.digest);
    expect(source).toMatchObject({ kind: "valid", record: { checkoutPath: h.source } });
  });

  it("finishes a landed move whose target record was already minted", async () => {
    const h = await harness();
    h.registerMoved();
    const minted = await mintLocusRecord({
      path: h.targetRecordPath,
      record: {
        schemaVersion: 1,
        recordId: h.targetIdentity.recordId,
        checkoutPath: h.targetPath,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "new-name", claimId: null },
          establishedAt: "2026-07-24T00:00:00.000Z",
          parentCheckoutPath: null,
          originEntry: null,
        },
        lease: null,
      },
    });
    if (minted.kind !== "created") throw new Error("fixture target record already exists");

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "rekeyed", recordId: h.targetIdentity.recordId });
    await expect(readFile(h.sourceRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reports an unrecorded checkout as absent rather than minting a role", async () => {
    const h = await harness();
    await rm(h.sourceRecordPath);

    const outcome = await h.driver.rekey({
      sourceCheckoutPath: h.source,
      targetCheckoutPath: h.targetPath,
      sourceSlug: "old-name",
      targetSlug: "new-name",
      expectedHead: HEAD,
    });

    expect(outcome).toEqual({ kind: "absent" });
    await expect(readFile(h.targetRecordPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
