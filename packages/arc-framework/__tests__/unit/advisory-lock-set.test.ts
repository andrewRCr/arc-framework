import { describe, expect, it } from "vitest";
import { acquireAdvisoryLocks, AdvisoryLockTimeoutError } from "../../src/lib/advisory-lock.js";

describe("advisory lock set wait policy", () => {
  it.each([undefined, 25])("keeps the native default or supplied wait (%s)", async (maxWaitMs) => {
    let now = 0;
    let failure: unknown;
    try {
      await acquireAdvisoryLocks(["held.lock"], {
        ...(maxWaitMs === undefined ? {} : { maxWaitMs }),
        now: () => now, sleep: async (milliseconds) => { now += milliseconds; },
        exclusiveCreate: async () => { throw Object.assign(new Error("held"), { code: "EEXIST" }); },
        readFile: async () => JSON.stringify({ pid: process.pid, acquiredAt: 0, token: "another-holder" }),
        isProcessAlive: () => true,
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AdvisoryLockTimeoutError);
    expect(failure).toMatchObject({ lockPath: "held.lock", waitedMs: maxWaitMs ?? 10_000, phase: "acquire" });
    expect(now).toBeGreaterThanOrEqual(maxWaitMs ?? 10_000);
  });
});
