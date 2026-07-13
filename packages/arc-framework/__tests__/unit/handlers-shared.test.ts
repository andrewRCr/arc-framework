import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { UserFetchResult } from "../../src/commands/user.js";

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
} = await import("../../src/handlers/shared.js");

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
