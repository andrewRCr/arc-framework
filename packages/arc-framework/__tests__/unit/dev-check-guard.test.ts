/** Command admission, refusal output and refresh eligibility through the synchronous guard. */
import { describe, expect, it } from "vitest";
import { classifyAdvisoryLockRead } from "../../src/lib/advisory-lock.js";
import { runDevBuildGuard, type DevBuildGuardDeps, type DevBuildGuardInput } from "../../src/lib/dev-check.js";

const now = 1_000_000;
function run(input: DevBuildGuardInput, overrides: Partial<DevBuildGuardDeps> = {}) {
  const messages: string[] = [];
  let exitCode: number | undefined;
  const deps: DevBuildGuardDeps = {
    token: undefined, readHolder: () => "absent", now: () => now,
    freshness: { newestSrc: () => ({ mtimeMs: now - 30_000, path: "src/cli.ts" }),
      distMtimeMs: () => now - 120_000, now: () => now,
      runtimeQualification: () => ({ status: "unqualified", reason: "Build input identity does not match." }) },
    writeStderr: (message) => { messages.push(message); },
    exit: (code) => { exitCode = code; },
    ...overrides,
  };
  return { eligible: runDevBuildGuard(input, deps), stderr: messages.join(""), exitCode };
}

describe("development command guard", () => {
  it("admits fresh refresh commands and marks them eligible", () => {
    expect(run({ commandPath: "arc base merge" }, { freshness: {
      newestSrc: () => ({ mtimeMs: now, path: "src/cli.ts" }), distMtimeMs: () => now,
      now: () => now, runtimeQualification: () => ({ status: "qualified" }),
    } })).toEqual({ eligible: true, stderr: "", exitCode: undefined });
  });

  it("refuses stale commands with the existing remedy and exit", () => {
    expect(run({ commandPath: "arc status" })).toEqual({ eligible: false, exitCode: 1,
      stderr: "error: arc dev build is stale (Build input identity does not match.; dist/cli.js built 2m ago). Refusing `arc status` against stale dist; run `npm run build:fast`, then retry.\n" });
  });

  it("warns and continues only for a stale compaction-seed write", () => {
    expect(run({ commandPath: "arc status", writeCompactionSeed: true })).toEqual({ eligible: false, exitCode: undefined,
      stderr: "warn: arc dev build is stale (Build input identity does not match.; dist/cli.js built 2m ago). Run `npm run build:fast` before relying on output.\n" });
  });

  it("admits an adopter silently without refresh eligibility", () => {
    const forbidden = (): never => { throw new Error("adopter accessed development inputs"); };
    expect(run({ commandPath: "arc base merge" }, { freshness: { newestSrc: () => null,
      distMtimeMs: forbidden, now: forbidden, runtimeQualification: forbidden } }))
      .toEqual({ eligible: false, stderr: "", exitCode: undefined });
  });

  it("admits a managed child without touching freshness dependencies or granting refresh", () => {
    const forbidden = (): never => { throw new Error("managed child accessed freshness inputs"); };
    const read = classifyAdvisoryLockRead({ text: JSON.stringify({ pid: 123, acquiredAt: now,
      token: "owned", leaseUntil: now + 1, metadata: { operation: "tests (integration)" } }) });
    let result: ReturnType<typeof run> | undefined;
    expect(() => { result = run({ commandPath: "arc base merge" }, { token: "owned", readHolder: () => read,
      freshness: { newestSrc: forbidden, distMtimeMs: forbidden, now: forbidden, runtimeQualification: forbidden } }); }).not.toThrow();
    expect(result).toEqual({ eligible: false, stderr: "", exitCode: undefined });
  });
});
