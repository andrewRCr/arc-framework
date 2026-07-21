/** Focused Result error and Probe-adapter coverage for status composition. */

import { describe, expect, it, vi } from "vitest";

import { err, ok } from "../../../src/lib/kernel/index.js";
import {
  SessionCompositionError,
  SessionIdentityMissingError,
  SessionProbeError,
  buildSessionSharedSlots,
  gatedSlot,
  safeProbe,
  toProbe,
  userSlot,
  type SessionStatusError,
} from "../../../src/commands/status/result-composition.js";
import type { SessionSharedProbes } from "../../../src/commands/status/types.js";

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

describe("identity and shared Result slots", () => {
  it("short-circuits a missing user identity without invoking the probe", async () => {
    const probe = vi.fn(async (identity: string) => identity);
    const result = await userSlot(null, probe);
    expect(probe).not.toHaveBeenCalled();
    expect(result.isErr() && result.error).toBeInstanceOf(SessionIdentityMissingError);
  });

  it("starts shared probes independently and isolates a sibling failure", async () => {
    const probes = {
      user: vi.fn(async (identity: string) => ({ identity })),
      worktree: vi.fn(async () => { throw new Error("worktree boom"); }),
      dirty: vi.fn(async () => ({ state: "clean", fileCount: 0 })),
      active: vi.fn(async () => ({ resolution: "none" })),
      releaseRouting: vi.fn(async () => ({ taskCommit: "raw" })),
    } as unknown as SessionSharedProbes;

    const shared = buildSessionSharedSlots({ identity: "andrew", role: "maintainer", probes });
    const [user, worktree, dirty, active, releaseRouting] = await Promise.all([
      shared.user,
      shared.worktree,
      shared.dirty,
      shared.active,
      shared.releaseRouting,
    ]);

    expect(probes.user).toHaveBeenCalledWith("andrew");
    expect(probes.active).toHaveBeenCalledWith("andrew", "maintainer");
    expect(worktree.isErr() && worktree.error.message).toBe("worktree boom");
    expect([user.isOk(), dirty.isOk(), active.isOk(), releaseRouting.isOk()]).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });
});
