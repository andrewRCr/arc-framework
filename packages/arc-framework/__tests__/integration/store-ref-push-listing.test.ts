import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createManualStepBarrier } from "../helpers/multi-clone.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";

const ref = "refs/arc/user/andrew/personal", claims = "refs/arc/user/andrew/claims";
const reference = RecordReferenceSchema.parse({ kind: "personal/document", key: "draft.md", owner: { type: "person", name: "andrew" } });
const claim = RecordReferenceSchema.parse({ kind: "claims/groom", key: "draft", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

describe.each(["default", "separate"] as const)("push listing in the %s layout", (layout) => {
  it("pushes changed refs without retrying a concurrently advanced unchanged ref", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "first\n", provenance }));
    success(await h.a.store.push());
    success(await h.b.store.pull());
    const base = success(await h.b.store.read({ reference }));
    success(await h.b.store.write({ action: "put", reference, expected: base.version, content: "other machine\n", provenance }));
    const other = (await h.b.git(["rev-parse", ref])).stdout;
    success(await h.a.store.write({ action: "put", reference: claim, expected: null, content: "{}", provenance }));
    let arm = true;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      if (args.includes("push") && arm) { arm = false; await h.b.git(["push", h.remoteName, `${ref}:${ref}`]); }
      return h.a.ports.exec(command, args, options);
    } });
    const pushed = success(await store.push());
    expect(pushed.pulls).toHaveLength(1);
    expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe(other);
    expect((await h.remote("git", ["rev-parse", claims])).stdout).toBe((await h.a.git(["rev-parse", claims])).stdout);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: claim })).content).toBe("{}");
    expect(success(await h.b.store.read({ reference })).content).toBe("other machine\n");
  });
  it("releases its initial locks and retakes a grown listing without deadlocking a batch writer", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "first\n", provenance }));
    success(await h.a.store.push());
    const base = success(await h.a.store.read({ reference }));
    success(await h.a.store.write({ action: "put", reference, expected: base.version, content: "pending\n", provenance }));
    const pending = success(await h.a.store.read({ reference }));
    const listing = createManualStepBarrier(), writerClaims = createManualStepBarrier();
    let heldPersonal = false, arm = true;
    const publisher = createRefStore({ ...h.a.ports, lock: async (name) => {
      const release = await h.a.ports.lock(name, 500);
      if (name === ref) heldPersonal = true;
      return async () => { if (name === ref) heldPersonal = false; await release(); };
    }, exec: async (command, args, options) => {
      if (arm && heldPersonal && args.includes("for-each-ref") && args.at(-1) === "refs/arc/") {
        arm = false; await listing.arrive();
      }
      return h.a.ports.exec(command, args, options);
    } });
    const pushing = publisher.push();
    let writing: ReturnType<typeof h.a.store.batch> | undefined;
    try {
      await Promise.race([listing.reached, pushing.then(() => { throw new Error("Push completed before its locked listing"); })]);
      const created = success(await h.a.store.write({ action: "put", reference: claim, expected: null, content: "{}", provenance }));
      const writer = createRefStore({ ...h.a.ports, lock: async (name) => {
        const release = await h.a.ports.lock(name, 1_000);
        if (name === claims) await writerClaims.arrive();
        return release;
      } });
      writing = writer.batch({ writes: [
        { action: "put", reference: claim, expected: created.version!, content: '{"step":1}' },
        { action: "put", reference, expected: pending.version, content: "batch\n" },
      ], provenance });
      await Promise.race([writerClaims.reached, writing.then(() => { throw new Error("Writer completed before holding its claims lock"); })]);
      writerClaims.release(); listing.release();
      success(await pushing); success(await writing);
      success(await h.b.store.pull());
      expect(success(await h.b.store.read({ reference })).content).toBe("batch\n");
      expect(success(await h.b.store.read({ reference: claim })).content).toBe('{"step":1}');
    } finally {
      writerClaims.release(); listing.release();
      await Promise.allSettled([pushing, ...writing ? [writing] : []]);
    }
  });

  it("refuses a held ref lock before pushing and succeeds after release", async () => {
    const h = await refSyncFixture(layout);
    success(await h.a.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
    const release = await h.a.ports.lock(ref, 100);
    const store = createRefStore({ ...h.a.ports, lock: (name) => h.a.ports.lock(name, 20) });
    try {
      expect(await store.push()).toMatchObject({ status: "refused", refusal: { code: "lock-held", class: "recoverable",
        lock: join(h.a.root, ".git", "arc", "locks", `${ref}.lock`) } });
      expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    } finally { await release(); }
    success(await store.push());
    expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe((await h.a.git(["rev-parse", ref])).stdout);
  });

});
