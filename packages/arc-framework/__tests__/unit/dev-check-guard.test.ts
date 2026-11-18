/** Command admission, rebuild, refusal output and refresh eligibility through the guard. */
import { describe, expect, it } from "vitest";
import { classifyAdvisoryLockRead } from "../../src/lib/advisory-lock.js";
import {
  runDevBuildGuard, type DevBuildGuardDeps, type DevBuildGuardInput, type DevCheckDeps,
} from "../../src/lib/dev-check.js";

const now = 1_000_000;
const STALENESS = "Build input identity does not match.; dist/cli.js built 2m ago";
const REFUSAL = `error: arc dev build is stale (${STALENESS}). Refusing \`arc status\` against stale dist; `
  + "run `npm run build:fast`, then retry.\n";
const REBUILDING = `info: rebuilding the stale arc dev build (${STALENESS}), then running \`arc status\` again.\n`;

/** Freshness whose qualification a completed rebuild may restore. */
function freshnessAfter(rebuildQualifies: boolean) {
  let qualified = false;
  const freshness: DevCheckDeps = {
    newestSrc: () => ({ mtimeMs: now - 30_000, path: "src/cli.ts" }),
    distMtimeMs: () => now - 120_000, now: () => now,
    runtimeQualification: () => qualified ? { status: "qualified" }
      : { status: "unqualified", reason: "Build input identity does not match." },
  };
  return { freshness, qualify: () => { qualified = rebuildQualifies; } };
}

async function run(input: DevBuildGuardInput, overrides: Partial<DevBuildGuardDeps> = {}, rebuildQualifies = true) {
  const messages: string[] = [];
  let exitCode: number | undefined;
  let rebuilds = 0;
  const { freshness, qualify } = freshnessAfter(rebuildQualifies);
  const deps: DevBuildGuardDeps = {
    token: undefined, readHolder: () => "absent", now: () => now, freshness, rerunning: false,
    rebuild: () => { rebuilds++; qualify(); return Promise.resolve({ kind: "completed" }); },
    writeStderr: (message) => { messages.push(message); },
    exit: (code) => { exitCode = code; },
    ...overrides,
  };
  const admission = await runDevBuildGuard(input, deps);
  return { admission, stderr: messages.join(""), exitCode, rebuilds };
}

const forbidden = (): never => { throw new Error("accessed an input this admission must not read"); };
const notRun = { kind: "run", refreshEligible: false };

describe("development command guard", () => {
  it("admits fresh refresh commands and marks them eligible", async () => {
    await expect(run({ commandPath: "arc base merge" }, { freshness: {
      newestSrc: () => ({ mtimeMs: now, path: "src/cli.ts" }), distMtimeMs: () => now,
      now: () => now, runtimeQualification: () => ({ status: "qualified" }),
    } })).resolves.toEqual({ admission: { kind: "run", refreshEligible: true }, stderr: "", exitCode: undefined,
      rebuilds: 0 });
  });

  it("rebuilds a stale build and runs the command again", async () => {
    await expect(run({ commandPath: "arc status" })).resolves.toEqual({ admission: { kind: "rerun" },
      stderr: REBUILDING, exitCode: undefined, rebuilds: 1 });
  });

  it("refuses with the remedy when the rebuild fails", async () => {
    await expect(run({ commandPath: "arc status" }, {
      rebuild: () => Promise.resolve({ kind: "failed", message: "the build exited with code 1" }),
    })).resolves.toEqual({ admission: notRun, exitCode: 1, rebuilds: 0,
      stderr: `${REBUILDING}error: arc could not rebuild the dev build (the build exited with code 1).\n${REFUSAL}` });
  });

  it("refuses with the remedy when the rebuilt bundle is still stale", async () => {
    await expect(run({ commandPath: "arc status" }, {}, false)).resolves.toEqual({ admission: notRun, exitCode: 1,
      rebuilds: 1,
      stderr: `${REBUILDING}error: arc could not rebuild the dev build (the rebuilt bundle is still stale).\n${REFUSAL}` });
  });

  it("refuses a stale re-run without rebuilding again", async () => {
    await expect(run({ commandPath: "arc status" }, { rerunning: true }))
      .resolves.toEqual({ admission: notRun, exitCode: 1, rebuilds: 0, stderr: REFUSAL });
  });

  it("warns and continues only for a stale compaction-seed write, without rebuilding", async () => {
    await expect(run({ commandPath: "arc status", writeCompactionSeed: true })).resolves.toEqual({
      admission: notRun, exitCode: undefined, rebuilds: 0,
      stderr: `warn: arc dev build is stale (${STALENESS}). Run \`npm run build:fast\` before relying on output.\n` });
  });

  it("admits an adopter silently without refresh eligibility or a rebuild", async () => {
    await expect(run({ commandPath: "arc base merge" }, { rebuild: forbidden, freshness: { newestSrc: () => null,
      distMtimeMs: forbidden, now: forbidden, runtimeQualification: forbidden } }))
      .resolves.toEqual({ admission: notRun, stderr: "", exitCode: undefined, rebuilds: 0 });
  });

  it("admits a managed child without touching freshness dependencies, granting refresh or rebuilding", async () => {
    const read = classifyAdvisoryLockRead({ text: JSON.stringify({ pid: 123, acquiredAt: now,
      token: "owned", leaseUntil: now + 1, metadata: { operation: "tests (integration)" } }) });
    await expect(run({ commandPath: "arc base merge" }, { token: "owned", readHolder: () => read, rebuild: forbidden,
      freshness: { newestSrc: forbidden, distMtimeMs: forbidden, now: forbidden, runtimeQualification: forbidden } }))
      .resolves.toEqual({ admission: notRun, stderr: "", exitCode: undefined, rebuilds: 0 });
  });
});
