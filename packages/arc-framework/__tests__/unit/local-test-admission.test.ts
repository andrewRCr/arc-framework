/** Unit tests for repository-wide admission of subprocess-heavy local test tiers. */

import { describe, expect, it, vi } from "vitest";

import {
  LOCAL_TEST_CONCURRENCY_OVERRIDE,
  resolveProcessVisibilityScope,
  withLocalHeavyTestAdmission,
} from "../../src/lib/local-test-admission.js";

function gitResult(args: string[]): { stdout: string; stderr: string } {
  if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
    return { stdout: "/repo/worktree-a\n", stderr: "" };
  }
  if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
    return { stdout: "/repo/.git\n", stderr: "" };
  }
  if (args[0] === "branch" && args[1] === "--show-current") {
    return { stdout: "feat/widget\n", stderr: "" };
  }
  throw new Error(`Unexpected git invocation: ${args.join(" ")}`);
}

describe("resolveProcessVisibilityScope", () => {
  it("uses the Linux PID namespace when procfs exposes it", async () => {
    await expect(resolveProcessVisibilityScope(
      "linux",
      "process-a",
      async () => "pid:[4026531836]",
    )).resolves.toBe("pid:[4026531836]");
  });

  it("uses a stable process-specific unknown scope when Linux procfs is unavailable", async () => {
    const unavailable = async (): Promise<string> => {
      throw new Error("procfs unavailable");
    };

    await expect(resolveProcessVisibilityScope("linux", "process-a", unavailable))
      .resolves.toBe("linux:unknown:process-a");
    await expect(resolveProcessVisibilityScope("linux", "process-a", unavailable))
      .resolves.toBe("linux:unknown:process-a");
    await expect(resolveProcessVisibilityScope("linux", "process-b", unavailable))
      .resolves.toBe("linux:unknown:process-b");
  });

  it("uses the host scope on platforms without Linux PID namespaces", async () => {
    await expect(resolveProcessVisibilityScope("darwin", "process-a"))
      .resolves.toBe("darwin:host");
  });
});

describe("withLocalHeavyTestAdmission", () => {
  it("queues behind the shared holder with useful diagnostics, then releases after the run", async () => {
    const lines: string[] = [];
    const action = vi.fn(async () => "complete");
    const releaseLock = vi.fn(async () => {});
    const acquireLock = vi.fn(async (_path, options) => {
      options.onWait?.({
        holder: {
          pid: 41,
          acquiredAt: Date.parse("2026-09-08T20:00:00.000Z"),
          token: "holder",
          metadata: {
            schemaVersion: 1,
            branch: "feat/other",
            tier: "e2e",
            worktree: "/repo/worktree-b",
            startedAt: "2026-09-08T20:00:00.000Z",
          },
        },
        waitedMs: 0,
      });
      options.onWait?.({
        holder: "unreadable",
        waitedMs: 60_000,
      });
      return { path: "/repo/.git/arc/test-suite/.local-heavy-tests.lock", pid: 42, token: "ours" };
    });

    const result = await withLocalHeavyTestAdmission(
      {
        cwd: "/repo/worktree-a/packages/arc-framework",
        env: {},
        tier: "integration",
      },
      action,
      {
        acquireLock,
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        now: () => Date.parse("2026-09-08T20:01:05.000Z"),
        pid: 42,
        processInstance: "test-process",
        releaseLock,
        resolveProcessScope: async () => "pid:[test]",
        writeLine: (line) => lines.push(line),
      },
    );

    expect(result).toBe("complete");
    expect(acquireLock).toHaveBeenCalledWith(
      "/repo/.git/arc/test-suite/.local-heavy-tests.lock",
      expect.objectContaining({
        leaseDurationMs: 120_000,
        maxWaitMs: Number.POSITIVE_INFINITY,
        metadata: {
          schemaVersion: 1,
          branch: "feat/widget",
          tier: "integration",
          worktree: "/repo/worktree-a",
          startedAt: "2026-09-08T20:01:05.000Z",
        },
        pid: 42,
        processInstance: "test-process",
        processScope: "pid:[test]",
      }),
    );
    expect(lines[0]).toContain("queued behind E2E tests");
    expect(lines[0]).toContain("PID 41");
    expect(lines[0]).toContain("/repo/worktree-b");
    expect(lines[0]).toContain("This is normal; no action is needed.");
    expect(lines[1]).toContain("Still queued after 1m");
    expect(lines[2]).toContain("slot acquired after waiting");
    expect(releaseLock).toHaveBeenCalledWith({
      path: "/repo/.git/arc/test-suite/.local-heavy-tests.lock",
      pid: 42,
      token: "ours",
    });
    expect(action).toHaveBeenCalledOnce();
  });

  it("renews the crash-recovery lease and installs immediate process-exit cleanup", async () => {
    const handle = { path: "/repo/.git/lock", pid: 42, token: "ours" };
    const renewLock = vi.fn(async () => "renewed" as const);
    const cancelHeartbeat = vi.fn();
    const unregisterExitCleanup = vi.fn();
    let heartbeat: (() => void) | undefined;
    const scheduleEvery = vi.fn((callback: () => void) => {
      heartbeat = callback;
      return cancelHeartbeat;
    });
    const registerExitCleanup = vi.fn(() => unregisterExitCleanup);

    await withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "e2e" },
      async () => {
        heartbeat?.();
        await vi.waitFor(() => expect(renewLock).toHaveBeenCalledOnce());
      },
      {
        acquireLock: vi.fn(async () => handle),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        pid: 42,
        registerExitCleanup,
        releaseLock: vi.fn(async () => {}),
        renewLock,
        resolveProcessScope: async () => "pid:[test]",
        scheduleEvery,
      },
    );

    expect(scheduleEvery).toHaveBeenCalledWith(expect.any(Function), 10_000);
    expect(renewLock).toHaveBeenCalledWith(handle, 120_000);
    expect(registerExitCleanup).toHaveBeenCalledWith(handle);
    expect(cancelHeartbeat).toHaveBeenCalledOnce();
    expect(unregisterExitCleanup).toHaveBeenCalledOnce();
  });

  it("retries temporary renewal contention but terminates after confirmed ownership loss", async () => {
    const lines: string[] = [];
    let heartbeat: (() => void) | undefined;
    let terminationRequests = 0;
    const renewLock = vi.fn()
      .mockResolvedValueOnce("retry" as const)
      .mockResolvedValueOnce("ownership-lost" as const);

    await withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "portability" },
      async () => {
        heartbeat?.();
        await vi.waitFor(() => expect(renewLock).toHaveBeenCalledTimes(1));
        expect(terminationRequests).toBe(0);
        heartbeat?.();
        await vi.waitFor(() => expect(terminationRequests).toBe(1));
      },
      {
        acquireLock: vi.fn(async () => ({ path: "/repo/.git/lock", pid: 42, token: "ours" })),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        pid: 42,
        releaseLock: vi.fn(async () => {}),
        renewLock,
        resolveProcessScope: async () => "pid:[test]",
        scheduleEvery: (callback) => {
          heartbeat = callback;
          return () => {};
        },
        terminateProcess: () => {
          terminationRequests += 1;
        },
        writeLine: (line) => lines.push(line),
      },
    );

    expect(lines).toContain(
      "Local heavy-test lock ownership was lost; stopping the admitted test controller.",
    );
  });

  it("stops before the last confirmed lease expires when renewal errors persist", async () => {
    let clock = 0;
    let heartbeat: (() => void) | undefined;
    let terminationRequests = 0;
    const lines: string[] = [];
    const renewLock = vi.fn(async () => await Promise.reject(new Error("write denied")));

    await withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "integration" },
      async () => {
        clock = 10_000;
        heartbeat?.();
        await vi.waitFor(() => expect(lines).toContain(
          "Unable to renew the local heavy-test lock heartbeat: write denied",
        ));
        expect(terminationRequests).toBe(0);

        clock = 110_000;
        heartbeat?.();
        await vi.waitFor(() => expect(terminationRequests).toBe(1));
        expect(lines).toContain(
          "Unable to renew the local heavy-test lock before its last confirmed lease deadline: write denied; "
          + "stopping the admitted test controller.",
        );
      },
      {
        acquireLock: vi.fn(async () => ({ path: "/repo/.git/lock", pid: 42, token: "ours" })),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        now: () => clock,
        pid: 42,
        releaseLock: vi.fn(async () => {}),
        renewLock,
        resolveProcessScope: async () => "pid:[test]",
        scheduleEvery: (callback) => {
          heartbeat = callback;
          return () => {};
        },
        terminateProcess: () => {
          terminationRequests += 1;
        },
        writeLine: (line) => lines.push(line),
      },
    );
  });

  it("stops before the last confirmed lease expires when retry results persist", async () => {
    let clock = 0;
    let heartbeat: (() => void) | undefined;
    let terminationRequests = 0;
    const lines: string[] = [];

    await withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "integration" },
      async () => {
        clock = 110_000;
        heartbeat?.();
        await vi.waitFor(() => expect(terminationRequests).toBe(1));
      },
      {
        acquireLock: vi.fn(async () => ({ path: "/repo/.git/lock", pid: 42, token: "ours" })),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        now: () => clock,
        pid: 42,
        releaseLock: vi.fn(async () => {}),
        renewLock: vi.fn(async () => "retry" as const),
        resolveProcessScope: async () => "pid:[test]",
        scheduleEvery: (callback) => {
          heartbeat = callback;
          return () => {};
        },
        terminateProcess: () => {
          terminationRequests += 1;
        },
        writeLine: (line) => lines.push(line),
      },
    );

    expect(lines).toContain(
      "Local heavy-test lock could not be renewed before its last confirmed lease deadline; "
      + "stopping the admitted test controller.",
    );
  });

  it("uses the acquired lease deadline after waiting for the shared slot", async () => {
    let clock = 0;
    let heartbeat: (() => void) | undefined;
    let terminationRequests = 0;
    const renewLock = vi.fn(async () => "retry" as const);

    await withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "integration" },
      async () => {
        clock = 190_000;
        heartbeat?.();
        await vi.waitFor(() => expect(renewLock).toHaveBeenCalledTimes(1));
        expect(terminationRequests).toBe(0);

        clock = 290_000;
        heartbeat?.();
        await vi.waitFor(() => expect(terminationRequests).toBe(1));
      },
      {
        acquireLock: vi.fn(async () => {
          clock = 180_000;
          return {
            path: "/repo/.git/lock",
            pid: 42,
            token: "ours",
            leaseUntil: 300_000,
          };
        }),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        now: () => clock,
        pid: 42,
        releaseLock: vi.fn(async () => {}),
        renewLock,
        resolveProcessScope: async () => "pid:[test]",
        scheduleEvery: (callback) => {
          heartbeat = callback;
          return () => {};
        },
        terminateProcess: () => {
          terminationRequests += 1;
        },
        writeLine: () => {},
      },
    );
  });

  it.each([
    ["CI", { CI: "true" }],
    ["the deliberate-contention override", { [LOCAL_TEST_CONCURRENCY_OVERRIDE]: "1" }],
  ])("bypasses local serialization under %s", async (_label, env) => {
    const action = vi.fn(async () => "complete");
    const acquireLock = vi.fn();
    const git = vi.fn();

    await expect(withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env, tier: "full" },
      action,
      { acquireLock, git },
    )).resolves.toBe("complete");

    expect(action).toHaveBeenCalledOnce();
    expect(acquireLock).not.toHaveBeenCalled();
    expect(git).not.toHaveBeenCalled();
  });

  it("releases the slot when the test runner fails", async () => {
    const failure = new Error("test failure");
    const releaseLock = vi.fn(async () => {});

    await expect(withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "e2e-focused" },
      async () => Promise.reject(failure),
      {
        acquireLock: vi.fn(async () => ({ path: "/repo/.git/lock", pid: 42, token: "ours" })),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        pid: 42,
        releaseLock,
        resolveProcessScope: async () => "pid:[test]",
      },
    )).rejects.toBe(failure);

    expect(releaseLock).toHaveBeenCalledOnce();
  });

  it("keeps synchronous exit cleanup installed until asynchronous release completes", async () => {
    let finishRelease: (() => void) | undefined;
    const releaseLock = vi.fn(async () => await new Promise<void>((resolve) => {
      finishRelease = resolve;
    }));
    const unregisterExitCleanup = vi.fn();
    const run = withLocalHeavyTestAdmission(
      { cwd: "/repo/worktree-a", env: {}, tier: "integration" },
      async () => {},
      {
        acquireLock: vi.fn(async () => ({ path: "/repo/.git/lock", pid: 42, token: "ours" })),
        git: vi.fn(async (_command, args) => gitResult(args)),
        mkdir: vi.fn(async () => undefined),
        pid: 42,
        registerExitCleanup: vi.fn(() => unregisterExitCleanup),
        releaseLock,
        resolveProcessScope: async () => "pid:[test]",
      },
    );

    await vi.waitFor(() => expect(releaseLock).toHaveBeenCalledOnce());
    expect(unregisterExitCleanup).not.toHaveBeenCalled();
    finishRelease?.();
    await run;
    expect(unregisterExitCleanup).toHaveBeenCalledOnce();
  });
});
