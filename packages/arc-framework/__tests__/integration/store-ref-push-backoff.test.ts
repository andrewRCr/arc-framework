import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, RecordReferenceSchema, PushResultSchema } from "../../src/lib/store/index.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
const common = personal("common.md"), local = personal("local.md");
const claim = RecordReferenceSchema.parse({ kind: "claims/groom", key: "during-backoff", owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" }, ref = "refs/arc/user/andrew/personal";

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

describe.each(["default", "separate"] as const)("push backoff in the %s layout", (layout) => {
  it("uses the random draw and last push duration for capped exponential waits without holding locks", async () => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    success(await h.a.store.write({ action: "put", reference: common, expected: null, content: "common\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference: local, expected: null, content: "from a\n", provenance }));
    const writer = createRefStore({ ...h.a.ports, lock: (name) => h.a.ports.lock(name, 20) });
    const draws = [0.25, 0.8, 0.9], durations = [10, 25, 6_000];
    let attempts = 0, firstWait = true;
    const publisher = createRefStore({ ...h.a.ports, ...clock, random: () => {
      const draw = draws.shift(); if (draw === undefined) throw new Error("Unexpected retry draw"); return draw;
    }, sleep: { ...clock.sleep, wait: async (milliseconds, signal) => {
      if (firstWait) {
        firstWait = false;
        const before = success(await writer.read({ reference: local }));
        success(await writer.batch({ writes: [
          { action: "put", reference: local, expected: before.version, content: "from a\nduring backoff\n" },
          { action: "put", reference: claim, expected: null, content: "{}" },
        ], provenance }));
      }
      await clock.sleep.wait(milliseconds, signal);
    } }, exec: async (command, args, options) => {
      if (!args.includes("push")) return h.a.ports.exec(command, args, options);
      const duration = durations[attempts];
      attempts++;
      if (duration !== undefined) {
        success(await h.b.store.write({ action: "put", reference: personal(`remote-${attempts}.md`), expected: null, content: `remote ${attempts}\n`, provenance }));
        await h.b.git(["push", h.remoteName, `${ref}:${ref}`]);
      }
      try { return await h.a.ports.exec(command, args, options); }
      finally { clock.advance(duration ?? 1); }
    } });
    const result = PushResultSchema.parse(success(await publisher.push()));
    expect(result.publishes.every((outcome) => "retryCount" in outcome && outcome.retryCount === 3 && outcome.waitedMs === 9_085)).toBe(true);
    expect(result.publishes.length).toBeGreaterThan(0);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: local })).content).toBe("from a\nduring backoff\n");
    expect(success(await h.b.store.read({ reference: claim })).content).toBe("{}");
    for (let number = 1; number <= 3; number++) expect(success(await h.b.store.read({ reference: personal(`remote-${number}.md`) })).content).toBe(`remote ${number}\n`);
  }, 20_000);
  it("ends between attempts when the deadline interrupts its wait and publishes saved writes on a new call", async () => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    success(await h.a.store.write({ action: "put", reference: common, expected: null, content: "common\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    success(await h.a.store.write({ action: "put", reference: local, expected: null, content: "pending\n", provenance }));
    let armed = true;
    const publisher = createRefStore({ ...h.a.ports, ...clock, random: () => 0.5,
      exec: async (command, args, options) => {
        if (!armed || !args.includes("push")) return h.a.ports.exec(command, args, options);
        armed = false;
        success(await h.b.store.write({ action: "put", reference: personal("remote.md"), expected: null, content: "other machine\n", provenance }));
        await h.b.git(["push", h.remoteName, `${ref}:${ref}`]);
        try { return await h.a.ports.exec(command, args, options); }
        finally { clock.advance(119_999); }
      } });
    const result = PushResultSchema.parse(success(await publisher.push()));
    expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", retryCount: 1, waitedMs: 1,
      failure: expect.objectContaining({ code: "retries-exhausted", class: "recoverable", retryCount: 1, waitedMs: 1 }) })]);
    expect(success(await h.a.store.read({ reference: local })).content).toBe("pending\n");
    success(await publisher.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: local })).content).toBe("pending\n");
    expect(success(await h.b.store.read({ reference: personal("remote.md") })).content).toBe("other machine\n");
  });
  it("limits a late native advisory-lock wait to the remaining budget and succeeds after release", async () => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    success(await h.b.store.write({ action: "put", reference: common, expected: null, content: "incoming\n", provenance }));
    success(await h.b.store.push());
    const release = await h.a.ports.lock(ref, 100);
    let armed = true;
    const store = createRefStore({ ...h.a.ports, ...clock, exec: async (command, args, options) => {
      const result = await h.a.ports.exec(command, args, options);
      if (armed && args.includes("fetch")) { armed = false; clock.advance(119_999); }
      return result;
    } });
    const pending = store.pull();
    try {
      const waiting = Symbol("waiting");
      const result = await Promise.race([pending, delay(1_500).then(() => waiting)]);
      expect(result).not.toBe(waiting);
      expect(result).toMatchObject({ status: "refused", refusal: { code: "lock-held", condition: "The lock remained held for 1ms." } });
    } finally { await release(); await pending.catch(() => undefined); }
    success(await store.pull());
    expect(success(await h.a.store.read({ reference: common })).content).toBe("incoming\n");
  });
});
