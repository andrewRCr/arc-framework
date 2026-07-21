/** Exact-generation locus record-store coverage. */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import {
  mintLocusRecord,
  readLocusRecord,
  removeLocusRecord,
  replaceLocusRecord,
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
      dispatchId: null,
      originEntry: null,
      routingPlanDigest: null,
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

  it("exclusively mints and compare-bytes replaces a generation", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const first = await mintLocusRecord({ path, record: record() });
    expect(first.kind).toBe("created");
    await expect(mintLocusRecord({ path, record: record("fedcba9876543210fedcba9876543210") }))
      .resolves.toEqual({ kind: "exists" });

    if (first.kind !== "created") throw new Error("fixture mint failed");
    const replaced = await replaceLocusRecord({
      path,
      expectedBytes: first.bytes,
      record: record("fedcba9876543210fedcba9876543210"),
    });
    expect(replaced.kind).toBe("replaced");
    await expect(replaceLocusRecord({ path, expectedBytes: first.bytes, record: record() }))
      .resolves.toEqual({ kind: "generation-mismatch" });
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({
      lease: { leaseId: "fedcba9876543210fedcba9876543210" },
    });
  });

  it("removes only the exact byte generation", async () => {
    const root = await temporaryRoot();
    const path = join(root, `locus-${identity.digest}.json`);
    const minted = await mintLocusRecord({ path, record: record() });
    if (minted.kind !== "created") throw new Error("fixture mint failed");

    await expect(removeLocusRecord({ path, expectedBytes: Buffer.from("stale") }))
      .resolves.toEqual({ kind: "generation-mismatch" });
    await expect(removeLocusRecord({ path, expectedBytes: minted.bytes }))
      .resolves.toEqual({ kind: "removed" });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-locus-record-"));
  roots.push(root);
  return root;
}
