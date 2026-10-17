import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore } from "../../src/lib/store/create.js";
import { createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { holdPersonalLockInProcess } from "../helpers/store/personal-lock-holder.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { updateRefTransaction } from "../../src/lib/git/ref-transaction.js";
import { writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";

const provenance = { verb: "test-write", lifecycleAction: "update" };
const primary = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha" }, kind: "work-item/meta" });

describe.each(["files", "reftable"] as const)("locked ref writes (%s)", (format) => {
  it("refuses another process's held ref lock and lands after the holder releases it", async () => {
    const f = await createRefReadFixture(format);
    const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (seeded.status !== "ok" || seeded.result.reference.owner.type !== "work-item") throw new Error("No seeded owner");
    const ref = `refs/arc/work/${seeded.result.reference.owner.uid}`;
    const path = join(f.root, ".git", "arc", "locks", `${ref}.lock`);
    const release = await holdPersonalLockInProcess(path);
    const native = createRefLockFactory(f.ports);
    const store = createRefStore({ ...f.ports, lock: (ref) => native(ref, 20) });
    const companion = RecordReferenceSchema.parse({ ...seeded.result.reference, kind: "work-item/companion", key: "extra" });
    const input = { action: "put" as const, reference: companion, expected: null, content: "locked write", provenance };
    const before = (await f.exec("git", ["rev-parse", ref])).stdout;
    try {
      expect(await store.write(input)).toMatchObject({ status: "refused", refusal: { code: "lock-held", lock: path } });
      expect((await f.exec("git", ["rev-parse", ref])).stdout).toBe(before);
      expect(await store.read({ reference: companion })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    } finally { await release(); }
    expect(await store.write(input)).toMatchObject({ status: "ok" });
    expect(await store.read({ reference: companion })).toMatchObject({ status: "ok", result: { content: "locked write" } });
  }, 10_000);
  it("releases and resolves again when the owner's ref advances before lock acquisition", async () => {
    const f = await createRefReadFixture(format);
    const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (seeded.status !== "ok" || seeded.result.reference.owner.type !== "work-item") throw new Error("No seeded owner");
    const uid = seeded.result.reference.owner.uid;
    const ref = `refs/arc/work/${uid}`;
    const oldTip = (await f.exec("git", ["rev-parse", ref])).stdout;
    const native = createRefLockFactory(f.ports);
    let move = true;
    const store = createRefStore({ ...f.ports, lock: async (requested, waitMs) => {
      if (move) {
        move = false;
        await plantRef(f.root, ref, [
          { path: `metadata-${uid}.json`, content: canonicalize({ formatVersion: 1, slug: "beta", formats: {},
            primary: { role: "work-item/meta", placement: { kind: "active" } } }) },
          { path: "meta-beta.md", content: makeMetaFixture("beta") },
          { path: "kept-beta.md", content: "competing write" },
        ], { parents: [oldTip] });
      }
      return native(requested, waitMs ?? 200);
    } });
    const companion = RecordReferenceSchema.parse({ ...seeded.result.reference, kind: "work-item/companion", key: "extra" });
    expect(await store.write({ action: "put", reference: companion, expected: null, content: "restarted write", provenance }))
      .toMatchObject({ status: "ok", result: { reference: { owner: { uid, name: "beta" } } } });
    expect((await f.exec("git", ["show", `${ref}:extra-beta.md`])).stdout).toBe("restarted write");
    expect((await f.exec("git", ["show", `${ref}:kept-beta.md`])).stdout).toBe("competing write");
    expect((await f.exec("git", ["ls-tree", "--name-only", ref])).stdout).not.toContain("extra-alpha.md");
  });
  it("never recreates the live ref when the owner retires before lock acquisition", async () => {
    const f = await createRefReadFixture(format);
    const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (seeded.status !== "ok" || seeded.result.reference.owner.type !== "work-item") throw new Error("No seeded owner");
    const uid = seeded.result.reference.owner.uid;
    if (!uid) throw new Error("No seeded UID");
    const ref = `refs/arc/work/${uid}`;
    const historyRef = `refs/arc/history/work/${uid}`;
    const oldTip = (await f.exec("git", ["rev-parse", ref])).stdout;
    const history = await plantRef(f.root, "refs/test/end", [], { parents: [oldTip] });
    const registry = await plantRef(f.root, "refs/test/registry", [
      { path: "metadata-registry.json", content: canonicalize({ formatVersion: 1, formats: {}, lineage: { [uid]: "alpha" } }) },
      { path: `lineage/${uid}.json`, content: writeLineageRecord({ schemaVersion: 2,
        origin: { name: seeded.result.reference.owner.name, uid }, kind: "abandon", successors: [], incoming: [], retiredBranches: [] }) },
    ]);
    const native = createRefLockFactory(f.ports);
    let retire = true;
    const store = createRefStore({ ...f.ports, lock: async (requested, waitMs) => {
      if (retire) {
        retire = false;
        const moved = await updateRefTransaction(f, [
          { ref, delete: true, expected: oldTip }, { ref: historyRef, next: history.tip, expected: null },
          { ref: "refs/arc/project/registry", next: registry.tip, expected: null },
        ]);
        if (moved.status !== "committed") throw new Error("The competing retirement did not land");
      }
      return native(requested, waitMs ?? 200);
    } });
    const companion = RecordReferenceSchema.parse({ ...seeded.result.reference, kind: "work-item/companion", key: "extra" });
    expect(await store.write({ action: "put", reference: companion, expected: null, content: "too late", provenance }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", reference: companion } });
    expect((await f.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/work/"])).stdout).toBe("");
    expect((await f.exec("git", ["rev-parse", historyRef])).stdout).toBe(history.tip);
    expect((await f.exec("git", ["ls-tree", historyRef])).stdout).toBe("");
  });
  it("releases the earlier ref lock when a later lock times out, leaving the batch unapplied", async () => {
    const f = await createRefReadFixture(format);
    const seeded = await f.store.write({ action: "put", reference: primary, expected: null,
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance });
    if (seeded.status !== "ok" || seeded.result.reference.owner.type !== "work-item") throw new Error("No seeded owner");
    const native = createRefLockFactory(f.ports);
    const workRef = `refs/arc/work/${seeded.result.reference.owner.uid}`;
    const personalRef = "refs/arc/user/andrew/personal";
    const releaseHeld = await native(workRef, 100);
    const store = createRefStore({ ...f.ports, lock: (ref) => native(ref, 20) });
    const companion = RecordReferenceSchema.parse({ ...seeded.result.reference, kind: "work-item/companion", key: "extra" });
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "note.txt" });
    const before = (await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    try {
      expect(await store.batch({ provenance, writes: [companion, personal].map((reference) => ({
        action: "put", reference, expected: null, content: "unapplied",
      })) })).toMatchObject({ status: "refused", refusal: { code: "lock-held" } });
      expect((await f.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(before);
      const released = await native(personalRef, 20);
      await released();
    } finally { await releaseHeld(); }
  });
  it("reports release failure as an error while preserving the already committed record", async () => {
    const f = await createRefReadFixture(format);
    const native = createRefLockFactory(f.ports);
    let cleanup = async () => {};
    const store = createRefStore({ ...f.ports, lock: async (ref) => {
      const release = await native(ref, 20);
      if (ref === "layout") return release;
      cleanup = release;
      const lockPath = join(f.root, ".git", "arc", "locks", `${ref}.lock`);
      return async () => {
        const blocker = await acquireAdvisoryLock(`${lockPath}.break`);
        try { await release(); } finally { await releaseAdvisoryLock(blocker); }
      };
    } });
    const personal = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "note.txt" });
    try {
      await expect(store.write({ action: "put", reference: personal, expected: null, content: "already committed", provenance }))
        .rejects.toMatchObject({ name: "AdvisoryLockTimeoutError", phase: "release", lockPath: expect.any(String) });
      expect(await store.read({ reference: personal })).toMatchObject({ status: "ok", result: { content: "already committed" } });
    } finally { await cleanup(); }
  });
});
