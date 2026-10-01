/** Exact-head required-check await behavior. */

import { describe, expect, it } from "vitest";

import {
  aggregateChecks,
  awaitRequiredChecks,
  observeRequiredChecks,
  type RequiredCheck,
  type RequiredChecksPort,
} from "../../../../src/scripts/review-gate/checks-await.js";
import type { BoundedWaitClock } from "../../../../src/scripts/review-gate/bounded-wait.js";

const headSha = "a".repeat(40);

function clock(): BoundedWaitClock {
  let now = 0;
  return { now: () => now, sleep: async (milliseconds) => { now += milliseconds; } };
}

function port(checks: RequiredCheck[]): RequiredChecksPort {
  return {
    resolveRepository: async () => "owner/repo",
    readHead: async () => headSha,
    readRequiredChecks: async () => checks,
    readObservedChecks: async () => checks,
  };
}

describe("aggregateChecks", () => {
  it.each([
    { checks: [], expected: "not-required" },
    { checks: [{ state: "green" }, { state: "green" }], expected: "green" },
    { checks: [{ state: "green" }, { state: "failed" }, { state: "pending" }], expected: "failed" },
    { checks: [{ state: "green" }, { state: "pending" }], expected: "pending" },
  ] as const)("reduces $expected", ({ checks, expected }) => {
    expect(aggregateChecks(checks)).toBe(expected);
  });
});

describe("required-checks observation", () => {
  it("returns a complete head-bound not-required observation", async () => {
    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: port([]),
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "not-required",
      nextAction: "complete",
      checks: [],
    });
  });

  it("returns every green required row on the observed head", async () => {
    const checks = [
      { name: "build", state: "green" },
      { name: "test", state: "green" },
    ] satisfies RequiredCheck[];

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: port(checks),
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "green",
      nextAction: "complete",
      checks,
    });
  });

  it("returns failed required rows without losing the observed target", async () => {
    const checks = [
      { name: "build", state: "green" },
      { name: "test", state: "failed" },
    ] satisfies RequiredCheck[];

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: port(checks),
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "failed",
      nextAction: "stop",
      checks,
    });
  });

  it("retains diagnostic failures beneath a pending required rollup", async () => {
    const checks = [{ name: "merge-ok", state: "pending" }] satisfies RequiredCheck[];
    const diagnosticPort = {
      ...port(checks),
      readObservedChecks: async () => [
        ...checks,
        { name: "E2E shard 3", state: "failed" },
      ],
    } satisfies RequiredChecksPort;

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: diagnosticPort,
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "pending",
      nextAction: "retry",
      checks,
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
    });
  });

  it("returns sanitized provider detail with rows already observed", async () => {
    const checks = [{ name: "merge-ok", state: "pending" }] satisfies RequiredCheck[];

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: {
        ...port(checks),
        readObservedChecks: async () => { throw new Error("  provider\n  unavailable  "); },
      },
      signal: new AbortController().signal,
    })).resolves.toEqual({
      schemaVersion: 1,
      mode: "review-checks-observe",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: "Required-check evidence was unavailable: provider unavailable",
      checks,
      diagnosticFailures: [],
    });
  });

  it.each([
    ["aborted", new DOMException("operator stopped the read", "AbortError")],
    ["deadline", new DOMException("read deadline elapsed", "TimeoutError")],
  ] as const)("preserves an injected %s cause", async (cause, reason) => {
    const controller = new AbortController();
    controller.abort(reason);

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: port([]),
      signal: controller.signal,
    })).resolves.toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "unavailable",
      nextAction: "retry",
      cause,
      detail: expect.stringContaining(reason.message),
      checks: [],
      diagnosticFailures: [],
    });
  });

  it("passes the injected signal through the repository observation", async () => {
    const controller = new AbortController();
    const reason = new DOMException("operator stopped the repository read", "AbortError");
    const boundaryPort: RequiredChecksPort = {
      ...port([]),
      resolveRepository: async (signal) => {
        if (signal !== controller.signal) throw new Error("unexpected signal");
        controller.abort(reason);
        signal.throwIfAborted();
        return "owner/repo";
      },
    };

    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: boundaryPort,
      signal: controller.signal,
    })).resolves.toMatchObject({
      state: "unavailable",
      cause: "aborted",
      detail: expect.stringContaining(reason.message),
    });
  });

  it("returns changed repository coordinates before reading the pull request", async () => {
    let reads = 0;
    await expect(observeRequiredChecks({
      repository: "owner/expected",
      pullRequest: 42,
      headSha,
    }, {
      port: {
        ...port([]),
        readHead: async () => { reads += 1; return headSha; },
      },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "target-mismatch",
      nextAction: "stop",
      actualRepository: "owner/repo",
    });
    expect(reads).toBe(0);
  });

  it("returns both approved and observed heads when the pull request moved", async () => {
    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: { ...port([]), readHead: async () => "b".repeat(40) },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: "b".repeat(40),
    });
  });

  it("returns stale when the pull-request head moves while required checks are read", async () => {
    let headReads = 0;
    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: {
        ...port([{ name: "build", state: "green" }]),
        readHead: async () => {
          headReads += 1;
          return headReads === 1 ? headSha : "b".repeat(40);
        },
      },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: "b".repeat(40),
    });
    expect(headReads).toBe(2);
  });

  it("returns stale when the pull-request head moves while diagnostic checks are read", async () => {
    let headReads = 0;
    const checks = [{ name: "merge-ok", state: "pending" }] satisfies RequiredCheck[];
    await expect(observeRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
    }, {
      port: {
        ...port(checks),
        readHead: async () => {
          headReads += 1;
          return headReads < 3 ? headSha : "b".repeat(40);
        },
        readObservedChecks: async () => [
          ...checks,
          { name: "E2E shard 3", state: "failed" },
        ],
      },
      signal: new AbortController().signal,
    })).resolves.toMatchObject({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: "b".repeat(40),
    });
    expect(headReads).toBe(3);
  });
});

describe("required-checks await", () => {
  it.each([
    [[], "not-required", "complete"],
    [[{ name: "build", state: "green" }] satisfies RequiredCheck[], "green", "complete"],
    [[{ name: "build", state: "failed" }] satisfies RequiredCheck[], "failed", "stop"],
  ] as const)("returns typed $state observations", async (checks, state, nextAction) => {
    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { port: port([...checks]), clock: clock() })).resolves.toMatchObject({ state, nextAction });
  });

  it("returns pending at the deadline instead of classifying the yield as failure", async () => {
    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { port: port([{ name: "build", state: "pending" }]), clock: clock() })).resolves.toMatchObject({
      state: "pending",
      nextAction: "await",
      elapsedMs: 2_000,
      checks: [{ name: "build", state: "pending" }],
    });
  });

  it("bounds the final observation by its reads, not by the polling interval", async () => {
    const pending = [{ name: "build", state: "pending" }] satisfies RequiredCheck[];
    let now = 0;
    // Reads answer at once until the deadline, then take longer than one polling interval.
    const read = <T>(value: T) => now < 100
      ? Promise.resolve(value)
      : new Promise<T>((resolve) => setTimeout(() => resolve(value), 10));

    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 100,
      pollIntervalMs: 20,
    }, {
      port: {
        resolveRepository: () => read("owner/repo"),
        readHead: () => read(headSha),
        readRequiredChecks: () => read(pending),
        readObservedChecks: () => read(pending),
      },
      clock: { now: () => now, sleep: async (milliseconds) => { now += milliseconds; } },
    })).resolves.toMatchObject({ state: "pending", nextAction: "await", checks: pending });
  });

  it("lets the final observation answer when the deadline cuts an observation short", async () => {
    const pending = [{ name: "build", state: "pending" }] satisfies RequiredCheck[];
    const slow = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 10));

    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 30,
      pollIntervalMs: 20,
    }, {
      port: {
        resolveRepository: () => slow("owner/repo"),
        readHead: () => slow(headSha),
        readRequiredChecks: () => slow(pending),
        readObservedChecks: () => slow(pending),
      },
      clock: clock(),
    })).resolves.toMatchObject({ state: "pending", nextAction: "await", checks: pending });
  });

  it("returns early diagnostic failures without granting them merge authority", async () => {
    const required = [{ name: "merge-ok", state: "pending" }] satisfies RequiredCheck[];
    const diagnosticPort = {
      ...port(required),
      readObservedChecks: async () => [
        ...required,
        { name: "E2E shard 3", state: "failed" },
      ],
    } as RequiredChecksPort;

    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, { port: diagnosticPort, clock: clock() })).resolves.toMatchObject({
      state: "pending",
      nextAction: "await",
      elapsedMs: 0,
      checks: required,
      diagnosticFailures: [{ name: "E2E shard 3", state: "failed" }],
    });
  });

  it("re-reads the head after the terminal sleep and stops when it moved", async () => {
    let now = 0;
    const terminalClock: BoundedWaitClock = {
      now: () => now,
      sleep: async (milliseconds) => { now += milliseconds; },
    };
    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: {
        ...port([{ name: "build", state: "pending" }]),
        readHead: async () => now < 2_000 ? headSha : "b".repeat(40),
      },
      clock: terminalClock,
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "stop",
      actualHeadSha: "b".repeat(40),
    });
  });

  it("stops when the pull-request head moves before reading checks", async () => {
    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: { ...port([]), readHead: async () => "b".repeat(40) },
      clock: clock(),
    })).resolves.toMatchObject({
      state: "stale-target",
      nextAction: "stop",
      headSha,
      actualHeadSha: "b".repeat(40),
    });
  });

  it("rejects checks resolved from a different repository before reading the pull request", async () => {
    let reads = 0;
    await expect(awaitRequiredChecks({
      repository: "owner/expected",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: {
        ...port([]),
        readHead: async () => { reads += 1; return headSha; },
      },
      clock: clock(),
    })).resolves.toMatchObject({
      state: "target-mismatch",
      actualRepository: "owner/repo",
    });
    expect(reads).toBe(0);
  });

  it("adds elapsed time while preserving an unavailable observation", async () => {
    await expect(awaitRequiredChecks({
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      timeoutMs: 2_000,
      pollIntervalMs: 500,
    }, {
      port: {
        ...port([]),
        readRequiredChecks: async () => { throw new Error("provider unavailable"); },
      },
      clock: clock(),
    })).resolves.toMatchObject({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: "owner/repo",
      pullRequest: 42,
      headSha,
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: "Required-check evidence was unavailable: provider unavailable",
      checks: [],
      diagnosticFailures: [],
      elapsedMs: 0,
    });
  });
});
