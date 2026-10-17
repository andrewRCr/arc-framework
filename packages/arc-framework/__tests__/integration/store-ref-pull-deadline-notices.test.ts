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
    const check: WriteCheck = ({ next }) => Promise.resolve(next?.content.includes("left=1") && next.content.includes("right=1") ? [{
      rule: "cohort.combination", condition: "The combined group needs a later edit.", remedy: { text: "Edit one combined field and save again." },
    }] : []);
    let firstApplied = false, armed = true, admitted: (() => void) | undefined;
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
    const groupRef = `refs/arc/cohort/${"uid" in group.reference.owner ? group.reference.owner.uid : ""}`;
    const store = createRefStore({ ...h.a.ports, ...clock, registry: { ...registry, "cohort/document": { ...registry["cohort/document"], check } },
      lock: async (name) => {
        const release = await h.a.ports.lock(name);
        return async () => { await release(); if (name === groupRef) firstApplied = true; };
      }, rawExec: (args, options) => firstApplied && armed && variant === "raw" && args.includes("cat-file")
        ? queueUntilCanceled(args, options?.signal) : h.a.ports.rawExec(args, options),
      execInput: (args, input, options) => firstApplied && armed && variant === "stdin" && args.includes("update-ref")
        ? queueUntilCanceled(args, options?.signal) : h.a.ports.execInput(args, input, options),
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
        notices: [expect.objectContaining({ kind: "rule-broken", rule: "cohort.combination", reference: group.reference })],
      })]);
      if ("publishes" in result) {
        const failed = result.pulls[0];
        if (failed?.status !== "failed") throw new Error("Expected a failed state pull");
        expect(result.publishes).toEqual([expect.objectContaining({ status: "failed", failure: failed.failure })]);
      }
      expect(success(await h.a.store.read({ reference: group.reference })).content).toContain("left=1\nseparator\nright=1");
      success(await store.pull());
      expect(success(await h.a.store.read({ reference: personal("remote.md") })).content).toBe("remote\n");
    } finally { clock.advance(120_000); rescue.abort(); await pending.catch(() => undefined); }
  });
});

it.each(["default", "separate"] as const)("reports a timed-out tracking acknowledgment after the receiver accepted and recovers on the next push (%s)", async (layout) => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
  const reference = personal("pending.md");
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "saved\n", provenance }));
  let pushed = false, armed = true, admitted: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => { admitted = resolve; });
  const rescue = new AbortController();
  const store = createRefStore({ ...h.a.ports, ...clock, exec: async (command, args, options) => {
    const result = await h.a.ports.exec(command, args, options);
    if (args.includes("push")) pushed = true;
    return result;
  }, execInput: (args, input, options) => {
    if (!pushed || !armed || !args.includes("update-ref")) return h.a.ports.execInput(args, input, options);
    armed = false; admitted?.();
    const signal = options?.signal ?? rescue.signal;
    return new Promise((_, reject) => {
      const cancel = () => reject(makeGitProcessError({ command: "git", args, isCanceled: true }));
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
      failure: expect.objectContaining({ code: "unreachable", cause: "timeout" }) })]);
    expect((await h.remote("git", ["rev-parse", "refs/arc/user/andrew/personal"])).stdout)
      .toBe((await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout);
    success(await store.push()); success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference })).content).toBe("saved\n");
  } finally { clock.advance(120_000); rescue.abort(); await pending.catch(() => undefined); }
});
