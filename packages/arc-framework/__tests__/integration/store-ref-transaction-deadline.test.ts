/** A sync deadline controls transaction admission without canceling an admitted ref update. */
import { expect, it } from "vitest";
import { updateRefTransaction } from "../../src/lib/git/ref-transaction.js";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success, testProvenance } from "../helpers/store/suite-tools.js";

const reference = RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "transaction.md" });
const state = "refs/arc/user/andrew/personal";

async function incoming(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Initial.\n", provenance: testProvenance }));
  success(await h.a.store.push());
  success(await h.b.store.pull());
  const current = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content: "Incoming.\n", provenance: testProvenance }));
  success(await h.a.store.push());
  return h;
}

it.each(["default", "separate"] as const)("finishes an admitted %s transaction after its sync deadline", async layout => {
  const h = await incoming(layout), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  let admitted = false;
  const store = createRefStore({ ...h.b.ports, ...clock, execInput: async (args, input, options) => {
    if (!admitted && args.includes("update-ref") && input.split("\n").some(line => line.startsWith(`update ${state} `))) {
      expect(options).toMatchObject({ uninterruptible: true });
      expect(options?.signal).toBeUndefined();
      admitted = true;
      clock.advance(120_000);
      await Promise.resolve();
    }
    return h.b.ports.execInput(args, input, options);
  } });
  await store.pull();
  expect(admitted).toBe(true);
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming.\n");
  success(await store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming.\n");
}, 40_000);

it("admits a transaction after the clock end while the deadline signal remains live", async () => {
  const h = await incoming("default"), timer = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  const local = RecordReferenceSchema.parse({ ...reference, key: "local.md" });
  success(await h.b.store.write({ action: "put", reference: local, expected: null, content: "Local.\n", provenance: testProvenance }));
  let clockOffset = 0;
  const store = createRefStore({ ...h.b.ports, ...timer, clock: () => new Date(timer.at().getTime() + clockOffset),
    exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("commit-tree") && args.filter(arg => arg === "-p").length === 2) clockOffset = 120_000;
      return result;
    },
  });
  await store.pull();
  expect(clockOffset).toBe(120_000);
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming.\n");
  expect(success(await h.b.store.read({ reference: local })).content).toBe("Local.\n");
}, 40_000);

it("keeps a caller's cancellation on an uninterruptible transaction and permits a retry", async () => {
  const h = await incoming("default");
  await h.b.git(["fetch", "--no-tags", "origin", state]);
  const before = (await h.b.git(["rev-parse", state])).stdout.trim();
  const next = (await h.b.git(["rev-parse", "FETCH_HEAD"])).stdout.trim();
  const controller = new AbortController();
  controller.abort();
  await expect(updateRefTransaction(h.b.ports, [{ ref: state, next, expected: before }], {
    cwd: h.b.root, signal: controller.signal,
  })).rejects.toMatchObject({ kind: "canceled", isCanceled: true });
  expect((await h.b.git(["rev-parse", state])).stdout.trim()).toBe(before);
  expect(success(await h.b.store.read({ reference })).content).toBe("Initial.\n");
  expect(await updateRefTransaction(h.b.ports, [{ ref: state, next, expected: before }], {
    cwd: h.b.root,
  })).toEqual({ status: "committed" });
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming.\n");
}, 40_000);

it("refuses a transaction whose deadline signal aborts before admission and retries", async () => {
  const h = await incoming("default"), clock = createRefClock(new Date("2026-01-01T00:00:00Z"), 0);
  const local = RecordReferenceSchema.parse({ ...reference, key: "local.md" });
  success(await h.b.store.write({ action: "put", reference: local, expected: null, content: "Local.\n", provenance: testProvenance }));
  const before = (await h.b.git(["rev-parse", state])).stdout.trim();
  let expired = false;
  const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
    const result = await h.b.ports.exec(command, args, options);
    if (!expired && args.includes("commit-tree") && args.filter(arg => arg === "-p").length === 2) {
      expired = true;
      clock.advance(120_000);
      await Promise.resolve();
    }
    return result;
  } });
  const result = await store.pull();
  expect(expired).toBe(true);
  expect(result).toMatchObject({ status: "ok", result: { pulls: expect.arrayContaining([
    expect.objectContaining({ status: "failed", failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) }),
  ]) } });
  expect((await h.b.git(["rev-parse", state])).stdout.trim()).toBe(before);
  expect(success(await h.b.store.read({ reference })).content).toBe("Initial.\n");
  success(await store.pull());
  expect(success(await h.b.store.read({ reference })).content).toBe("Incoming.\n");
  expect(success(await h.b.store.read({ reference: local })).content).toBe("Local.\n");
}, 40_000);
