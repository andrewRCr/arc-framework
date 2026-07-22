import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { deriveLocusRecordId } from "../../../src/lib/locus/path-identity.js";
import { mintLocusRecord, readLocusRecord } from "../../../src/lib/locus/record-store.js";
import { locusLockPath, locusRecordPath, type LocusRoot } from "../../../src/lib/locus/root.js";
import { createNodeTeardownLocusDriver } from "../../../src/lib/work-unit/teardown-locus.js";

const removals: string[] = [];

afterEach(async () => {
  await Promise.all(removals.splice(0).map(async (path) => rm(path, { recursive: true, force: true })));
});

async function harness(options: { record?: boolean; head?: string } = {}) {
  const primary = await mkdtemp(join(tmpdir(), "arc-teardown-primary-"));
  const target = await mkdtemp(join(tmpdir(), "arc-teardown-target-"));
  removals.push(primary, target);
  const head = options.head ?? "a".repeat(40);
  const calls: string[][] = [];
  const exec: GitExec = async (_command, args) => {
    calls.push([...args]);
    if (args[0] !== "worktree" || args[1] !== "list") throw new Error(`unexpected git call: ${args.join(" ")}`);
    return {
      stdout:
        `worktree ${primary}\0HEAD ${"b".repeat(40)}\0branch refs/heads/main\0\0`
        + `worktree ${target}\0HEAD ${head}\0branch refs/heads/feat/demo\0\0`,
    };
  };
  const identity = deriveLocusRecordId(target, process.platform === "win32" ? "windows" : "posix");
  const root: LocusRoot = {
    primaryPath: primary,
    userRoot: join(primary, ".arc", "user", "andrew"),
    lociRoot: join(primary, ".arc", "user", "andrew", ".internal", "loci"),
    locksRoot: join(primary, ".arc", "user", "andrew", ".internal", "loci", ".locks"),
  };
  const recordPath = locusRecordPath(root, identity.digest);
  let recordGeneration: string | null = null;
  if (options.record !== false) {
    const created = await mintLocusRecord({
      path: recordPath,
      record: {
        schemaVersion: 1,
        recordId: identity.recordId,
        checkoutPath: target,
        role: {
          kind: "work-unit",
          subject: { kind: "work-unit", key: "demo", claimId: null },
          establishedAt: "2026-07-21T00:00:00.000Z",
          parentCheckoutPath: null,
          dispatchId: null,
          originEntry: null,
          routingPlanDigest: null,
        },
        lease: null,
      },
    });
    if (created.kind !== "created") throw new Error("fixture record already exists");
    recordGeneration = digest(created.bytes);
  }
  return {
    target,
    head,
    calls,
    recordPath,
    lockPath: locusLockPath(root, identity.digest),
    driver: createNodeTeardownLocusDriver({ exec, identity: "andrew" }),
    expectedOccupancy: {
      kind: "clear" as const,
      recordId: options.record === false ? null : identity.recordId,
      leaseId: null,
      leaseState: "absent" as const,
      recordGeneration,
      lockGeneration: null,
      markerGeneration: null,
    },
  };
}

describe("teardown target-lock transaction", () => {
  it.each([true, false])("locks record-%s targets across local revalidation and retirement", async (withRecord) => {
    const h = await harness({ record: withRecord });
    const events: string[] = [];
    await h.driver.retire({
      checkoutPath: h.target,
      expectedHead: h.head,
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: h.expectedOccupancy,
      revalidateLocal: async () => {
        await expect(readFile(h.lockPath, "utf8")).resolves.toContain('"token"');
        events.push("revalidate");
      },
      retireProjection: async () => {
        await expect(readFile(h.lockPath, "utf8")).resolves.toContain('"token"');
        events.push("remove");
      },
    });
    expect(events).toEqual(["revalidate", "remove"]);
    await expect(readFile(h.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readLocusRecord({
      path: h.recordPath,
      expectedDigest: deriveLocusRecordId(h.target, process.platform === "win32" ? "windows" : "posix").digest,
      pathFlavor: process.platform === "win32" ? "windows" : "posix",
    })).resolves.toMatchObject({ kind: "absent" });
    expect(h.calls.every((args) => args[0] === "worktree" && args[1] === "list")).toBe(true);
  });

  it("leaves the role unchanged and releases the lock when physical retirement fails", async () => {
    const h = await harness();
    await expect(h.driver.retire({
      checkoutPath: h.target,
      expectedHead: h.head,
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: h.expectedOccupancy,
      revalidateLocal: async () => {},
      retireProjection: async () => { throw new Error("remove failed"); },
    })).rejects.toThrow(/remove failed/iu);
    await expect(readFile(h.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(h.recordPath, "utf8")).resolves.toContain(identityRecordId(h.target));
  });

  it("rejects roster, predicate, and role-generation changes before retirement", async () => {
    const changedHead = await harness();
    await expect(changedHead.driver.retire({
      checkoutPath: changedHead.target,
      expectedHead: "c".repeat(40),
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: changedHead.expectedOccupancy,
      revalidateLocal: async () => {},
      retireProjection: async () => { throw new Error("must not remove"); },
    })).rejects.toThrow(/expected live roster generation/iu);

    const predicate = await harness();
    await expect(predicate.driver.retire({
      checkoutPath: predicate.target,
      expectedHead: predicate.head,
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: predicate.expectedOccupancy,
      revalidateLocal: async () => { throw new Error("marker changed"); },
      retireProjection: async () => { throw new Error("must not remove"); },
    })).rejects.toThrow(/marker changed/iu);
    await expect(readFile(predicate.lockPath)).rejects.toMatchObject({ code: "ENOENT" });

    const generation = await harness();
    await expect(generation.driver.retire({
      checkoutPath: generation.target,
      expectedHead: generation.head,
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: { ...generation.expectedOccupancy, recordGeneration: `sha256:${"f".repeat(64)}` },
      revalidateLocal: async () => {},
      retireProjection: async () => { throw new Error("must not remove"); },
    })).rejects.toThrow(/role or lease generation changed/iu);
  });

  it("reports an exact role-pop mismatch and still releases the target lock", async () => {
    const h = await harness();
    await expect(h.driver.retire({
      checkoutPath: h.target,
      expectedHead: h.head,
      subject: { kind: "work-unit", name: "demo" },
      expectedOccupancy: h.expectedOccupancy,
      revalidateLocal: async () => {},
      retireProjection: async () => {
        const bytes = await readFile(h.recordPath);
        await writeFile(h.recordPath, Buffer.concat([bytes, Buffer.from("\n")]));
      },
    })).rejects.toThrow(/role generation changed before pop/iu);
    await expect(readFile(h.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(h.recordPath)).resolves.toBeInstanceOf(Buffer);
  });
});

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function identityRecordId(path: string): string {
  return deriveLocusRecordId(path, process.platform === "win32" ? "windows" : "posix").recordId;
}
