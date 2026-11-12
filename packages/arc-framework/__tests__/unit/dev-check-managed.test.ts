/** Managed child freshness decisions against a classified artifact lease. */
import { describe, expect, it } from "vitest";
import { classifyAdvisoryLockRead } from "../../src/lib/advisory-lock.js";
import { shouldSkipDevBuildStaleness } from "../../src/lib/dev-check.js";

const now = 1_000;
const holder = { pid: 123, acquiredAt: 900, token: "owned", leaseUntil: now + 1,
  metadata: { operation: "tests (e2e)" } };

describe("managed test child freshness", () => {
  it("skips only for the matching live controller", () => {
    const read = classifyAdvisoryLockRead({ text: JSON.stringify(holder) });
    expect(shouldSkipDevBuildStaleness("owned", read, now)).toBe(true);
  });

  it.each([
    ["mismatched token", "other", holder],
    ["no token", undefined, holder],
    ["build holder", "owned", { ...holder, metadata: { operation: "build (fast)" } }],
    ["expired lease", "owned", { ...holder, leaseUntil: now - 1 }],
    ["lease deadline", "owned", { ...holder, leaseUntil: now }],
    ["no lease", "owned", { pid: holder.pid, acquiredAt: holder.acquiredAt,
      token: holder.token, metadata: holder.metadata }],
  ])("runs the check with %s", (_label, token, record) => {
    const read = classifyAdvisoryLockRead({ text: JSON.stringify(record) });
    expect(shouldSkipDevBuildStaleness(token, read, now)).toBe(false);
  });

  it.each([
    ["absent", { error: { code: "ENOENT" } }],
    ["unreadable", { error: { code: "EACCES" } }],
    ["empty", { text: "" }],
    ["corrupt", { text: "{" }],
  ])("runs the check after an %s holder read", (_label, observation) => {
    const read = classifyAdvisoryLockRead(observation);
    expect(shouldSkipDevBuildStaleness("owned", read, now)).toBe(false);
  });
});
