/** Bounded-read and exclusive-mint locus record-store coverage. */

import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import {
  createLocusRecordMinter,
  mintLocusRecord,
  readLocusRecord,
  type LocusRecordMintContext,
} from "../../../src/lib/locus/record-store.js";
import { MAX_LOCUS_JSON_BYTES } from "../../../src/lib/locus/schema/index.js";

const roots: string[] = [];
const checkoutPath = "/repo/worktree";
const identity = deriveLocusRecordId(checkoutPath, "posix");
const timestamp = "2026-07-18T00:00:00.000Z";

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
