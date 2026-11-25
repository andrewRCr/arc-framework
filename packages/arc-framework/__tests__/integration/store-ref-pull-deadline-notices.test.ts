import { unconfirmedCancellation } from "../helpers/store/unconfirmed-cancellation.js";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, createKindRegistry, RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key, owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

beforeEach(() => { vi.stubEnv("FORCE_COLOR", undefined); });
afterEach(() => { vi.unstubAllEnvs(); });

describe.each(["default", "separate"] as const)("partial pull deadline in the %s layout", (layout) => {
  it.each(["raw", "stdin", "push raw"] as const)("cancels a queued %s call and retains notices from earlier committed merges", async (mode) => {
    const variant = mode === "stdin" ? "stdin" : "raw", operation = mode === "push raw" ? "push" : "pull";
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
    const requested = RecordReferenceSchema.parse({ kind: "cohort/document", owner: { type: "cohort", name: "group" } });
    const content = "# Group\n\n**Purpose:** Retain the group.\n\nleft=0\nseparator\nright=0\n";
    const group = success(await h.a.store.write({ action: "put", reference: requested, expected: null, content, provenance }));
    success(await h.a.store.write({ action: "put", reference: personal("common.md"), expected: null, content: "common\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const a = success(await h.a.store.read({ reference: group.reference })), b = success(await h.b.store.read({ reference: group.reference }));
    success(await h.a.store.write({ action: "put", reference: a.reference, expected: a.version, content: content.replace("left=0", "left=1"), provenance }));
    success(await h.b.store.write({ action: "put", reference: b.reference, expected: b.version, content: content.replace("right=0", "right=1"), provenance }));
    success(await h.a.store.write({ action: "put", reference: personal("local.md"), expected: null, content: "local\n", provenance }));
    success(await h.b.store.write({ action: "put", reference: personal("remote.md"), expected: null, content: "remote\n", provenance }));
    success(await h.b.store.push());
    const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
    const check: WriteCheck = ({ next }) => Promise.resolve(next?.content === "remote\n" ? [{
      rule: "personal.combination", condition: "The combined personal records need a later edit.", remedy: { text: "Edit one combined field and save again." },
    }] : []);
    let firstApplied = false, armed = true, refusedTransaction = false, admitted: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admitted = resolve; });
    const rescue = new AbortController();
    const queueUntilCanceled = (args: string[], signal: AbortSignal | undefined): Promise<never> => {
      armed = false; admitted?.();
      const active = signal ?? rescue.signal;
      return new Promise((_, reject) => {
        const cancel = () => reject(makeGitProcessError({ command: "git", args, isCanceled: true }));
        if (active.aborted) cancel(); else active.addEventListener("abort", cancel, { once: true });
      });
    };
    const firstRef = "refs/arc/user/andrew/personal";
    const store = createRefStore({ ...h.a.ports, ...clock, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
      lock: async (name) => {
        const release = await h.a.ports.lock(name);
        return async () => { await release(); if (name === firstRef) firstApplied = true; };
      }, rawExec: (args, options) => firstApplied && armed && variant === "raw" && args.includes("cat-file")
        ? queueUntilCanceled(args, options?.signal) : h.a.ports.rawExec(args, options),
      execInput: (args, input, options) => {
        if (firstApplied && armed && variant === "stdin") {
          if (args.includes("update-ref") && !refusedTransaction) {
            refusedTransaction = true;
            return h.a.ports.execInput([...args, "--invalid"], input, options);
          }
          if (refusedTransaction && args.includes("for-each-ref")) return queueUntilCanceled(args, options?.signal);
        }
        return h.a.ports.execInput(args, input, options);
      },
    });
    const pending = store[operation]();
    void pending.catch(() => undefined);
    try {
      await Promise.race([ready, pending.then(() => { throw new Error("Pull ended before its queued Git call"); })]);
      clock.advance(120_000);
      const waiting = Symbol("waiting");
      const ended = await Promise.race([pending, delay(1_000).then(() => waiting)]);
      expect(ended).not.toBe(waiting);
      if (typeof ended === "symbol") throw new Error("The queued Git call did not honor the deadline");
      const result = success(ended);
      expect(result.pulls).toEqual([expect.objectContaining({ status: "failed",
        failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }),
        notices: [expect.objectContaining({ kind: "rule-broken", rule: "personal.combination", reference: personal("remote.md") })],
      })]);
      if ("publishes" in result) {
        const failed = result.pulls[0];
        if (failed?.status !== "failed") throw new Error("Expected a failed state pull");
        expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", failure: failed.failure })]);
      }
      expect(success(await h.a.store.read({ reference: personal("remote.md") })).content).toBe("remote\n");
      success(await store.pull());
      expect(success(await h.a.store.read({ reference: group.reference })).content).toContain("left=1\nseparator\nright=1");
    } finally { clock.advance(120_000); rescue.abort(); await pending.catch(() => undefined); }
  });
});

it.each(["default", "separate"] as const)("reports a timed-out tracking acknowledgment read-back after receiver acceptance and recovers on the next push (%s)", async (layout) => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
  const reference = personal("pending.md");
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "saved\n", provenance }));
  let pushed = false, armed = true, refusedAcknowledgment = false, admitted: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { admitted = resolve; });
  const rescue = new AbortController();
  const store = createRefStore({ ...h.a.ports, ...clock, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (args.includes("push")) pushed = true;
    return result;
  }, execInput: (args, input, options) => {
    if (!pushed || !armed) return h.a.ports.execInput(args, input, options);
    if (args.includes("update-ref") && !refusedAcknowledgment) {
      refusedAcknowledgment = true;
      return h.a.ports.execInput([...args, "--invalid"], input, options);
    }
    if (!refusedAcknowledgment || !args.includes("for-each-ref")) return h.a.ports.execInput(args, input, options);
    armed = false; admitted?.();
    const signal = options?.signal ?? rescue.signal;
    return new Promise((_, reject) => {
      const cancel = () => reject(unconfirmedCancellation(args, "Original acknowledgment cancellation."));
      if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
    });
  } });
  const pending = store.push();
  void pending.catch(() => undefined);
  try {
    await Promise.race([ready, pending.then(() => { throw new Error("Push ended before acknowledging its accepted tip"); })]);
    clock.advance(120_000);
    const waiting = Symbol("waiting");
    const ended = await Promise.race([pending, delay(1_000).then(() => waiting)]);
    expect(ended).not.toBe(waiting);
    if (typeof ended === "symbol") throw new Error("The acknowledgment did not honor the deadline");
    expect(success(ended).publishes).toEqual([expect.objectContaining({ status: "failed",
      failure: expect.objectContaining({ code: "unreachable", cause: "timeout",
        condition: expect.stringContaining("descendant processes not confirmed ended") }) })]);
    expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout)
      .toBe((await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout);
    success(await store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("saved\n");
  } finally { clock.advance(120_000); rescue.abort(); await pending.catch(() => undefined); }
});

describe.each(["default", "separate"] as const)("a lock wait the deadline cuts short in the %s layout", (layout) => {
  it.each(["pull", "push"] as const)("ends the %s's state pull failed with a timeout, not a held lock, and applies on the next run", async (operation) => {
    const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 1);
    success(await h.a.store.write({ action: "put", reference: personal("published.md"), expected: null, content: "published\n", provenance }));
    success(await h.a.store.push());
    success(await h.b.store.write({ action: "put", reference: personal("local.md"), expected: null, content: "local\n", provenance }));
    const ref = "refs/arc/user/andrew/personal";
    const before = (await h.b.git(["rev-parse", ref])).stdout;
    let expire = true, pastDeadline = false;
    const expiredAdmissions: string[] = [];
    const store = createRefStore({ ...h.b.ports, ...clock,
      lock: async (name, waitMs) => {
        if (pastDeadline) expiredAdmissions.push(name);
        return h.b.ports.lock(name, waitMs);
      }, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (expire && args.includes("fetch")) {
        // Pass the deadline by clock readings alone, so its timer never fires and no Git call is aborted.
        expire = false;
        clock.advance(119_000);
        for (let reading = 0; reading < 2_000; reading += 1) clock.clock();
        pastDeadline = true;
      }
      return result;
    } });
    const result = success(await store[operation]());
    expect(expire).toBe(false);
    expect(result.pulls).toEqual([expect.objectContaining({ status: "failed",
      failure: expect.objectContaining({ code: "unreachable", cause: "timeout",
        condition: expect.stringContaining("deadline expired while waiting for"),
        remedy: { text: expect.stringContaining(`Retry the ${operation}`) } }) })]);
    expect(expiredAdmissions).toEqual([]);
    expect((await h.b.git(["rev-parse", ref])).stdout).toBe(before);
    pastDeadline = false;
    success(await store[operation]());
    expect(success(await h.b.store.read({ reference: personal("published.md") })).content).toBe("published\n");
    if (operation === "push") {
      success(await h.a.store.pull());
      expect(success(await h.a.store.read({ reference: personal("local.md") })).content).toBe("local\n");
    }
  });
});

it.each(["default", "separate"] as const)("refuses the next lock when only the deadline signal expired and recovers (%s)", async (layout) => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
  const reference = personal("pending.md"), ref = "refs/arc/user/andrew/personal";
  success(await h.a.store.write({ action: "put", reference: personal("seed.md"), expected: null, content: "seed\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  success(await h.b.store.write({ action: "put", reference, expected: null, content: "pending\n", provenance }));
  const before = (await h.b.git(["rev-parse", ref])).stdout;
  const remoteBefore = (await h.remote("git", ["rev-parse", ref])).stdout;
  let finish: () => void = () => {}, fetched = false, expired = false, armed = true;
  const expiredAdmissions: string[] = [];
  const store = createRefStore({ ...h.b.ports, ...clock,
    sleep: { ...clock.sleep, bound: (_milliseconds, signal) => new Promise<void>(resolve => {
      finish = resolve;
      if (signal.aborted) resolve(); else signal.addEventListener("abort", () => resolve(), { once: true });
    }) },
    exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("fetch")) fetched = true;
      return result;
    },
    lock: async (name, waitMs) => {
      if (expired) expiredAdmissions.push(name);
      const release = await h.b.ports.lock(name, waitMs);
      if (armed && fetched && name === "layout") {
        armed = false; finish(); await Promise.resolve(); expired = true;
      }
      return release;
    },
  });
  const result = success(await store.push());
  expect(expired).toBe(true);
  expect(clock.at().getTime()).toBe(0);
  expect(result.publishes).toEqual([expect.objectContaining({ status: "failed",
    failure: expect.objectContaining({ code: "unreachable", cause: "timeout",
      condition: expect.stringContaining(`The sync deadline expired while waiting for refs/arc/tmp/seen/${h.remoteName}.`),
      remedy: { text: expect.stringContaining("Retry the push") } }) })]);
  expect(expiredAdmissions).toEqual([]);
  expect((await h.b.git(["rev-parse", ref])).stdout).toBe(before);
  expect((await h.remote("git", ["rev-parse", ref])).stdout).toBe(remoteBefore);
  expired = false;
  success(await store.push()); success(await h.a.store.pull());
  expect(success(await h.a.store.read({ reference })).content).toBe("pending\n");
});
