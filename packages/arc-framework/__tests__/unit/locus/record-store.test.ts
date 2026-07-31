/** Bounded-read and exclusive-mint locus record-store coverage. */

import {
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocusLock,
  releaseLocusLock,
  type LocusLockHandle,
} from "../../../src/lib/locus/lock.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import type { ProcessInspector } from "../../../src/lib/locus/process-inspector.js";
import {
  createLocusRecordMinter,
  mintLocusRecord,
  readLocusRecord,
  removeLocusRecord,
  replaceLocusRecord,
  type LocusRecordMintContext,
} from "../../../src/lib/locus/record-store.js";
import { MAX_LOCUS_JSON_BYTES } from "../../../src/lib/locus/schema/index.js";

const roots: string[] = [];
const checkoutPath = "/repo/worktree";
const identity = deriveLocusRecordId(checkoutPath, "posix");
const timestamp = "2026-07-18T00:00:00.000Z";
const anchor = {
  kind: "process" as const,
  pid: 42,
  startToken: "start-42",
  inspector: "fixture",
  selector: "codex",
};
const liveInspector: ProcessInspector = {
  kind: "fixture",
  inspect: async (pid) => ({
    kind: "present",
    pid,
    parentPid: 1,
    startToken: `start-${pid}`,
    commandIdentity: "codex",
  }),
};

function record(leaseId = "0123456789abcdef0123456789abcdef") {
  return {
    schemaVersion: 1 as const,
    recordId: identity.recordId,
    checkoutPath,
    role: {
      kind: "work-unit",
      subject: { kind: "work-unit", key: "sample", claimId: null },
      establishedAt: timestamp,
      parentCheckoutPath: null,
      originEntry: null,
    },
    lease: {
      leaseId,
      sessionHomePath: checkoutPath,
      anchor: { kind: "process" as const, pid: 42, startToken: "start", inspector: "linux-proc", selector: "codex" },
      attachedAt: timestamp,
      heartbeatAt: timestamp,
    },
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("locus record store", () => {
  it("distinguishes absent, valid, malformed, unsupported, and digest mismatch", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toEqual({ kind: "absent" });

    await writeFile(path, `${JSON.stringify(record())}\n`);
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "valid", record: record() });

    await writeFile(path, "{bad");
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "malformed" });

    await writeFile(path, JSON.stringify({ ...record(), schemaVersion: undefined }));
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "malformed" });

    await writeFile(path, JSON.stringify({ ...record(), schemaVersion: 2 }));
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "unsupported", schemaVersion: 2 });

    await writeFile(path, JSON.stringify({ ...record(), recordId: `sha256:${"b".repeat(64)}` }));
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "digest-mismatch" });
  });

  it("rejects oversized input at the bounded read", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    await writeFile(path, "x".repeat(MAX_LOCUS_JSON_BYTES + 1));
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toEqual({ kind: "oversized" });
  });

  it("exclusively mints one record generation", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const first = await mintLocusRecord({ path, record: record() });
    expect(first.kind).toBe("created");
    await expect(mintLocusRecord({ path, record: record("fedcba9876543210fedcba9876543210") }))
      .resolves.toEqual({ kind: "exists" });

    if (first.kind !== "created") throw new Error("fixture mint failed");
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "valid", record: record(), bytes: first.bytes });
  });

  it("refuses to publish after losing the exact record-lock generation", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));

    await expect(mintLocusRecord({
      path,
      record: record(),
      lock,
      beforePublishRecheck: async () => {
        await releaseLocusLock(lock);
      },
    })).rejects.toThrow("Locus record lock generation is no longer owned");
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toEqual({ kind: "absent" });
  });

  it("replaces only the exact byte generation under the matching held lock", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));
    const first = await mintLocusRecord({ path, record: record() });
    if (first.kind !== "created") throw new Error("fixture mint failed");

    const replaced = await replaceLocusRecord({
      path,
      expectedBytes: first.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
      lock,
    });
    expect(replaced.kind).toBe("replaced");
    await expect(replaceLocusRecord({ path, expectedBytes: first.bytes, record: record(), lock }))
      .resolves.toEqual({ kind: "generation-mismatch" });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      lease: { leaseId: "fedcba9876543210fedcba9876543210" },
    });
  });

  it("allows only one concurrent replacement for one expected generation and lock", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");

    let arrivals = 0;
    let signalFirstArrival = (): void => undefined;
    const firstArrival = new Promise<void>((resolve) => {
      signalFirstArrival = resolve;
    });
    let releaseRechecks = (): void => undefined;
    const rechecksReleased = new Promise<void>((resolve) => {
      releaseRechecks = resolve;
    });
    const beforeReplaceRecheck = async (): Promise<void> => {
      arrivals += 1;
      if (arrivals === 1) signalFirstArrival();
      if (arrivals === 2) releaseRechecks();
      await rechecksReleased;
    };

    const first = replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("1".repeat(32)),
      lock,
      beforeReplaceRecheck,
    });
    await firstArrival;
    const second = replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("2".repeat(32)),
      lock,
      beforeReplaceRecheck,
    });
    const releaseTimeout = setTimeout(releaseRechecks, 100);
    const results = await Promise.all([first, second]);
    clearTimeout(releaseTimeout);

    const replaced = results.filter((result) => result.kind === "replaced");
    expect(replaced).toHaveLength(1);
    expect(results.filter((result) => result.kind === "generation-mismatch")).toHaveLength(1);
    await expect(readFile(path)).resolves.toEqual(replaced[0]?.bytes);
  });

  it("maps disappearance during the replacement recheck to a generation mismatch", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");

    await expect(replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
      lock,
      beforeReplaceRecheck: async () => unlink(path),
    })).resolves.toEqual({ kind: "generation-mismatch" });
  });

  it("refuses replacement under a lock held for a different record", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");
    const unrelatedLock = await acquireRecordLock(
      join(root, ".locks", `locus-${"b".repeat(64)}.lock`),
      "a".repeat(32),
    );

    await expect(replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
      lock: unrelatedLock,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      lease: { leaseId: "0123456789abcdef0123456789abcdef" },
    });
  });

  it("removes only the exact byte generation under the matching held lock", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");

    await expect(removeLocusRecord({ path, expectedBytes: Buffer.from("stale"), lock }))
      .resolves.toEqual({ kind: "generation-mismatch" });
    await expect(removeLocusRecord({ path, expectedBytes: minted.bytes, lock }))
      .resolves.toEqual({ kind: "removed" });
    await expect(removeLocusRecord({ path, expectedBytes: minted.bytes, lock }))
      .resolves.toEqual({ kind: "generation-mismatch" });
    await expect(replaceLocusRecord({ path, expectedBytes: minted.bytes, record: record(), lock }))
      .resolves.toEqual({ kind: "generation-mismatch" });
  });

  it("refuses removal under a lock held for a different record", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");
    const unrelatedLock = await acquireRecordLock(
      join(root, ".locks", `locus-${"b".repeat(64)}.lock`),
      "a".repeat(32),
    );

    await expect(removeLocusRecord({
      path,
      expectedBytes: minted.bytes,
      lock: unrelatedLock,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    await expect(readFile(path)).resolves.toEqual(minted.bytes);
  });

  it("refuses replacement and removal after the exact lock generation is released", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lock = await acquireRecordLock(recordLockPath(root), "a".repeat(32));
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");
    await expect(releaseLocusLock(lock)).resolves.toEqual({ kind: "released" });

    await expect(replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
      lock,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    await expect(removeLocusRecord({
      path,
      expectedBytes: minted.bytes,
      lock,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    await expect(readFile(path)).resolves.toEqual(minted.bytes);
  });

  it("keeps a blocked contender from clobbering or deleting a newer record generation", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const lockPath = recordLockPath(root);
    const owner = await acquireRecordLock(lockPath, "a".repeat(32));
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");

    await expect(acquireLocusLock({
      path: lockPath,
      anchor: { ...anchor, pid: 43, startToken: "start-43" },
      inspector: liveInspector,
      token: "b".repeat(32),
      timeoutMs: 0,
    })).resolves.toEqual({ kind: "refused", reason: "live" });

    const replaced = await replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
      lock: owner,
    });
    if (replaced.kind !== "replaced") throw new Error("fixture replacement failed");
    await expect(releaseLocusLock(owner)).resolves.toEqual({ kind: "released" });

    const contender = await acquireLocusLock({
      path: lockPath,
      anchor: { ...anchor, pid: 43, startToken: "start-43" },
      inspector: liveInspector,
      token: "b".repeat(32),
    });
    if (contender.kind !== "acquired") throw new Error("fixture contender acquisition failed");
    await expect(replaceLocusRecord({
      path,
      expectedBytes: minted.bytes,
      record: record(),
      lock: contender.handle,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    await expect(removeLocusRecord({
      path,
      expectedBytes: minted.bytes,
      lock: contender.handle,
    })).resolves.toEqual({ kind: "generation-mismatch" });
    await expect(readFile(path)).resolves.toEqual(replaced.bytes);

    const current = await replaceLocusRecord({
      path,
      expectedBytes: replaced.bytes,
      record: record(),
      lock: contender.handle,
    });
    expect(current).toMatchObject({ kind: "replaced" });
    if (current.kind !== "replaced") throw new Error("fixture contender replacement failed");
    await expect(readFile(path)).resolves.toEqual(current.bytes);
  });

  it("keeps an incomplete staged generation invisible to readers", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    let resumeWrite = (): void => undefined;
    const writePaused = new Promise<void>((resolve) => {
      resumeWrite = resolve;
    });
    let signalWriteStarted = (): void => undefined;
    const writeStarted = new Promise<void>((resolve) => {
      signalWriteStarted = resolve;
    });
    const minter = createLocusRecordMinter(mintContext({
      writeFile: async (target, bytes, options) => {
        await writeFile(target, bytes.subarray(0, Math.floor(bytes.length / 2)), options);
        signalWriteStarted();
        await writePaused;
        await writeFile(target, bytes);
      },
    }));
    const pendingMint = minter({ path, record: record() });

    await writeStarted;
    try {
      await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
        .resolves.toEqual({ kind: "absent" });
    } finally {
      resumeWrite();
      await pendingMint;
    }
  });

  it("cleans an interrupted staged write without occupying the record path", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const minter = createLocusRecordMinter(mintContext({
      writeFile: async (target, bytes, options) => {
        await writeFile(target, bytes.subarray(0, Math.floor(bytes.length / 2)), options);
        throw new Error("simulated interrupted write");
      },
    }));

    await expect(minter({ path, record: record() })).rejects.toThrow("simulated interrupted write");
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toEqual({ kind: "absent" });
    await expect(readdir(root)).resolves.toEqual([]);
  });

  it("publishes exactly one complete generation across concurrent mints", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => mintLocusRecord({
        path,
        record: record(index.toString(16).padStart(32, "0")),
      })),
    );
    const created = results.filter((result) => result.kind === "created");
    expect(created).toHaveLength(1);
    expect(results.filter((result) => result.kind === "exists")).toHaveLength(7);
    await expect(readLocusRecord({ path, expectedDigest: identity.digest, pathFlavor: "posix" }))
      .resolves.toMatchObject({ kind: "valid", bytes: created[0]?.bytes });
    await expect(readdir(root)).resolves.toEqual([`locus-${identity.digest}.json`]);
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-locus-record-"));
  roots.push(root);
  return root;
}

function mintContext(
  overrides: Partial<LocusRecordMintContext> = {},
): LocusRecordMintContext {
  let sequence = 0;
  return {
    mkdir,
    writeFile,
    link,
    unlink,
    randomId: () => `test-${String(sequence++)}`,
    ...overrides,
  };
}

async function acquireRecordLock(path: string, token: string): Promise<LocusLockHandle> {
  const acquired = await acquireLocusLock({
    path,
    anchor,
    inspector: liveInspector,
    token,
  });
  if (acquired.kind !== "acquired") throw new Error("fixture lock acquisition failed");
  return acquired.handle;
}

function recordLockPath(root: string): string {
  return join(root, ".locks", `locus-${identity.digest}.lock`);
}
