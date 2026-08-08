/** Focused Result error and Probe-adapter coverage for status composition. */

import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../src/lib/kernel/index.js";
import {
  SessionCompositionError,
  SessionIdentityMissingError,
  SessionProbeError,
  buildSessionRemoteContextSlot,
  gatedSlot,
  safeProbe,
  toProbe,
  userSlot,
  type SessionStatusError,
} from "../../../src/commands/status/result-composition.js";

describe("status Result error taxonomy", () => {
  it("retains identity, probe, and composition context", () => {
    const cause = new Error("probe failed");
    const identity = new SessionIdentityMissingError("user");
    const probe = new SessionProbeError("worktree", cause);
    const composition = new SessionCompositionError("resolve-load-set", "loadSet", cause);

    expect(identity).toMatchObject({ code: "session.identity-missing", slot: "user" });
    expect(probe).toMatchObject({
      code: "session.probe-failed",
      slot: "worktree",
      message: "probe failed",
      originalCause: cause,
      cause,
    });
    expect(composition).toMatchObject({
      code: "session.composition-failed",
      operation: "resolve-load-set",
      slot: "loadSet",
      originalCause: cause,
      cause,
    });
  });

  it("retains String(cause) for non-Error failures", () => {
    const cause = { kind: "marker" };
    expect(new SessionProbeError("config", cause)).toMatchObject({
      message: "[object Object]",
      originalCause: cause,
    });
  });
});

describe("toProbe", () => {
  it("adapts success without changing value identity", () => {
    const value = { retained: true };
    expect(toProbe(ok<typeof value, SessionStatusError>(value))).toEqual({ ok: true, value });
  });

  it.each([
    [new SessionIdentityMissingError("user"), "identity-missing"],
    [new SessionProbeError("worktree", new Error("probe failed")), "runtime"],
    [new SessionCompositionError("resolve-load-set", "loadSet", "composition failed"), "runtime"],
  ] as const)("maps $code through the stable wire error channel", (error, kind) => {
    expect(toProbe(err<never, SessionStatusError>(error))).toEqual({
      ok: false,
      error: { kind, message: error.message },
    });
  });
});

describe("safeProbe and gatedSlot", () => {
  it.each([
    ["synchronous", (): Promise<number> => { throw new Error("sync boom"); }],
    ["asynchronous", async (): Promise<number> => { throw new Error("async boom"); }],
  ])("maps a %s failure with slot and cause context", async (_kind, probe) => {
    const result = await safeProbe("fixture", probe);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({ slot: "fixture", originalCause: expect.any(Error) });
    }
  });

  it("preserves successful values and non-Error rejection causes", async () => {
    const value = { retained: true };
    expect(await safeProbe("fixture", async () => value)).toEqual(ok(value));
    const rejected = await safeProbe("fixture", () => Promise.reject("nope"));
    expect(rejected.isErr() && rejected.error).toMatchObject({
      message: "nope",
      originalCause: "nope",
    });
  });

  it("keeps skipped optional slots outside the Result algebra", async () => {
    const probe = vi.fn(async () => 42);
    expect(gatedSlot(false, "fixture", probe)).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
    expect((await gatedSlot(true, "fixture", probe)!).isOk()).toBe(true);
  });
});

describe("session remote-context staging", () => {
  it("passes one unreachable context identity to every dependent probe", async () => {
    const context = {
      kind: "unreachable" as const,
      snapshot: { kind: "unreachable" as const, failureReason: "network" as const },
    };
    let acquisitions = 0;
    const slot = buildSessionRemoteContextSlot(async () => {
      acquisitions += 1;
      return context;
    });
    const observed: unknown[] = [];

    const [worktree, baseDistance] = await Promise.all([
      slot.run("worktree", async (value) => {
        observed.push(value);
        return "worktree-degraded";
      }),
      slot.run("baseDistance", async (value) => {
        observed.push(value);
        return "base-degraded";
      }),
    ]);

    expect(acquisitions).toBe(1);
    expect(observed).toEqual([context, context]);
    expect(worktree.isOk() && worktree.value).toBe("worktree-degraded");
    expect(baseDistance.isOk() && baseDistance.value).toBe("base-degraded");
  });

  it("isolates one unavailable prerequisite as a runtime error on each dependent slot", async () => {
    const slot = buildSessionRemoteContextSlot(async () => ({
      kind: "unavailable",
      prerequisite: "remote-configuration",
    }));
    const independent = safeProbe("dirty", async () => "local-clean");

    const [worktree, baseDistance, dirty] = await Promise.all([
      slot.run("worktree", async () => "must-not-resolve"),
      slot.run("baseDistance", async () => "must-not-resolve"),
      independent,
    ]);

    expect(worktree.isErr() && worktree.error).toMatchObject({
      slot: "worktree",
      message: "Session remote prerequisite failed: remote-configuration.",
    });
    expect(baseDistance.isErr() && baseDistance.error).toMatchObject({
      slot: "baseDistance",
      message: "Session remote prerequisite failed: remote-configuration.",
    });
    expect(dirty.isOk() && dirty.value).toBe("local-clean");
  });

  it("isolates a throwing context read as a runtime error on each dependent slot", async () => {
    const slot = buildSessionRemoteContextSlot(async () => {
      throw new Error("ls-remote exploded");
    });
    const independent = safeProbe("dirty", async () => "local-clean");

    const [worktree, baseDistance, dirty] = await Promise.all([
      slot.run("worktree", async () => "must-not-resolve"),
      slot.run("baseDistance", async () => "must-not-resolve"),
      independent,
    ]);

    expect(worktree.isErr() && worktree.error).toMatchObject({
      slot: "worktree",
      message: "ls-remote exploded",
    });
    expect(baseDistance.isErr() && baseDistance.error).toMatchObject({
      slot: "baseDistance",
      message: "ls-remote exploded",
    });
    expect(dirty.isOk() && dirty.value).toBe("local-clean");
  });
});

describe("identity-scoped Result slots", () => {
  it("short-circuits a missing user identity without invoking the probe", async () => {
    const probe = vi.fn(async (identity: string) => identity);
    const result = await userSlot(null, probe);
    expect(probe).not.toHaveBeenCalled();
    expect(result.isErr() && result.error).toBeInstanceOf(SessionIdentityMissingError);
  });
});
