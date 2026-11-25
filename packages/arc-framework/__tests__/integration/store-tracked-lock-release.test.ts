/** Applied mutations and failed advisory release remain distinguishable from acquisition refusals. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireAdvisoryLock, releaseAdvisoryLock, type AdvisoryLockHandle } from "../../src/lib/advisory-lock.js";
import { withTrackedWriteLock } from "../../src/lib/store/tracked-lock.js";
import { trackedWriteFixture, trackedDigest, candidateFixture } from "../helpers/store/tracked-write-fixture.js";
import { serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "edit" };
async function releaseOwnedFile(path: string) {
  const holder = JSON.parse(await readFile(path, "utf8")) as { pid: number; token: string };
  await releaseAdvisoryLock({ path, ...holder });
}

describe("tracked advisory release failure", () => {
  it.each(["single", "batch"] as const)("preserves applied %s bytes and reports the release phase", async (mode) => {
    const h = await trackedWriteFixture();
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    const path = join(h.root, ".arc/active/meta-example.md");
    await writeFile(path, "before");
    const reference = h.reference("work-item/meta");
    let blocker: AdvisoryLockHandle | undefined;
    let lock = "";
    h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root, options: { maxWaitMs: 15 } }, async (held) => {
      lock = held;
      const result = await operation();
      blocker = await acquireAdvisoryLock(`${held}.break`);
      return result;
    });
    const input = { action: "put" as const, reference, content: "applied", expected: trackedDigest("before"), placement: { kind: "active" as const } };
    let failure: unknown;
    try { await (mode === "single" ? h.store.write({ ...input, provenance }) : h.store.batch({ writes: [input], provenance })); }
    catch (error) { failure = error; }
    try {
      expect(failure).toMatchObject({ code: "store.operation-failed", cause: { name: "AdvisoryLockTimeoutError", lockPath: lock, phase: "release" } });
      expect(await readFile(path, "utf8")).toBe("applied");
    } finally {
      if (blocker !== undefined) await releaseAdvisoryLock(blocker);
      if (lock) await releaseOwnedFile(lock);
    }
    h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root }, operation);
    const current = success(await h.store.read({ reference }));
    success(await h.store.write({ ...input, content: "after repair", expected: current.version, provenance }));
    expect(await readFile(path, "utf8")).toBe("after repair");
  });

  it("preserves both a primary operation failure and the failed release", async () => {
    const h = await trackedWriteFixture();
    await mkdir(join(h.root, ".arc/active"), { recursive: true });
    const path = join(h.root, ".arc/active/meta-example.md");
    await writeFile(path, "before");
    const primary = new Error("Replacement failed");
    const write = h.ports.fs.writeFile;
    h.ports.fs.writeFile = async (target, content) => {
      if (target === path && content === "replacement") throw primary;
      await write(target, content);
    };
    let blocker: AdvisoryLockHandle | undefined;
    let lock = "";
    h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root, options: { maxWaitMs: 15 } }, async (held) => {
      lock = held;
      try { return await operation(); }
      finally { blocker = await acquireAdvisoryLock(`${held}.break`); }
    });
    let failure: unknown;
    try { await h.store.write({ action: "put", reference: h.reference("work-item/meta"), content: "replacement", expected: trackedDigest("before"), placement: { kind: "active" }, provenance }); }
    catch (error) { failure = error; }
    try {
      expect(failure).toMatchObject({ code: "store.operation-failed", cause: { errors: [primary, { name: "AdvisoryLockTimeoutError", phase: "release" }], cause: primary } });
      expect(await readFile(path, "utf8")).toBe("before");
    } finally {
      if (blocker !== undefined) await releaseAdvisoryLock(blocker);
      if (lock) await releaseOwnedFile(lock);
    }
    h.ports.fs.writeFile = write;
    h.ports.locks.tracked = (operation) => withTrackedWriteLock({ exec: h.exec, checkoutRoot: h.root }, operation);
    success(await h.store.write({ action: "put", reference: h.reference("work-item/meta"), content: "replacement", expected: trackedDigest("before"), placement: { kind: "active" }, provenance }));
  });

  it("keeps a nested canonical release timeout out of the unapplied lock refusal", async () => {
    const h = await trackedWriteFixture();
    const path = join(h.root, ".arc/system/.internal/candidates/example.json");
    await mkdir(join(h.root, ".arc/system/.internal/candidates"), { recursive: true });
    const candidate = candidateFixture();
    const content = serializeCandidateManagedRecord(candidate);
    const write = h.ports.fs.writeFile;
    const create = h.ports.fs.exclusiveCreate;
    let blocker: AdvisoryLockHandle | undefined;
    let accelerate = false, elapsed = 0;
    h.ports.clock = () => new Date(Date.now() + (accelerate ? (elapsed += 10_000) : 0));
    h.ports.fs.writeFile = async (target, bytes) => {
      await write(target, bytes);
      if (target === path && bytes === content) blocker = await acquireAdvisoryLock(`${path}.lock.break`);
    };
    h.ports.fs.exclusiveCreate = async (target, bytes) => {
      try { await create(target, bytes); }
      catch (error) { if (target === `${path}.lock.break`) accelerate = true; throw error; }
    };
    let failure: unknown;
    try { await h.store.write({ action: "put", reference: h.reference("review/candidate"), content, expected: null, provenance }); }
    catch (error) { failure = error; }
    try {
      expect(failure).toBeDefined();
      const containsRelease = (error: unknown): boolean => typeof error === "object" && error !== null && (
        ("phase" in error && error.phase === "release") || ("cause" in error && containsRelease(error.cause))
        || (error instanceof AggregateError && error.errors.some(containsRelease)));
      expect(containsRelease(failure)).toBe(true);
      expect(await readFile(path, "utf8")).toBe(content);
    } finally {
      if (blocker !== undefined) await releaseAdvisoryLock(blocker);
      await releaseOwnedFile(`${path}.lock`);
    }
    h.ports.fs.writeFile = write;
    h.ports.fs.exclusiveCreate = create;
    h.ports.clock = () => new Date();
    const current = success(await h.store.read({ reference: h.reference("review/candidate") }));
    success(await h.store.write({ action: "put", reference: h.reference("review/candidate"), content, expected: current.version, provenance }));
  });
});
