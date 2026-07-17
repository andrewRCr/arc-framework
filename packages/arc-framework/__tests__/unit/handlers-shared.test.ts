import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserFetchResult } from "../../src/commands/user.js";
import type { SyncOutput } from "../../src/lib/sync-output.js";

const mockLog = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock("@clack/prompts", () => ({
  log: mockLog,
}));

const {
  isMissingRemoteError,
  isRemoteError,
  reportUserFetchOutcome,
  runWithSpinner,
} = await import("../../src/handlers/shared.js");

describe("runWithSpinner", () => {
  it("stops with the failure label and rethrows the operation error", async () => {
    let started: string | undefined;
    let stopped: string | undefined;
    const spinner = {
      start: (message?: string) => { started = message; },
      stop: (message?: string) => { stopped = message; },
    };
    const output = { spinner: () => spinner } as unknown as SyncOutput;
    const error = new Error("operation failed");

    await expect(
      runWithSpinner(output, "Working...", async () => Promise.reject(error), "Done."),
    ).rejects.toBe(error);

    expect(started).toBe("Working...");
    expect(stopped).toBe("Failed.");
  });
});

describe("handlers/shared remote fetch reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("reports a missing origin as missing configuration", () => {
    const result = {
      kind: "remote-unavailable",
      error: new Error("fatal: No such remote 'origin'"),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "fetch");

    expect(isMissingRemoteError(result.error.message)).toBe(true);
    expect(isRemoteError(result.error.message)).toBe(true);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No remote configured"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("git remote add origin"));
    expect(process.exitCode).toBe(1);
  });

  it("reports remote access failures without calling them missing configuration", () => {
    const result = {
      kind: "remote-unavailable",
      error: new Error("fatal: Could not read from remote repository."),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "pull");

    expect(isMissingRemoteError(result.error.message)).toBe(false);
    expect(isRemoteError(result.error.message)).toBe(true);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("Remote unavailable"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("network, authentication"));
    expect(mockLog.error).not.toHaveBeenCalledWith(expect.stringContaining("No remote configured"));
    expect(process.exitCode).toBe(1);
  });

  it("explains that pull refuses diverged refs and directs to inspection", () => {
    const result = {
      kind: "refused-diverged",
      localTip: "a".repeat(40),
      remoteTip: "b".repeat(40),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "pull");

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("pull refuses diverged notes refs"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("arc user status"));
    expect(process.exitCode).toBe(1);
  });
});
