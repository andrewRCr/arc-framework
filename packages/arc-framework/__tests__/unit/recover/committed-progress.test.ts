import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { resolveCommittedProgress } from "../../../src/lib/recover/committed-progress.js";

const SEED_SHA = "72d145021bf4166fa70efc5b9fd11916cf0a359a";
const HEAD_SHA = "aabbccddeeff00112233445566778899aabbccdd";

/** Build a fake GitExec that dispatches on the joined argument vector. */
function fakeExec(handler: (key: string) => string): {
  exec: GitExec;
  calls: string[];
} {
  const calls: string[] = [];
  const exec: GitExec = (_cmd, args) => {
    const key = args.join(" ");
    calls.push(key);
    return Promise.resolve({ stdout: handler(key) });
  };
  return { exec, calls };
}

describe("resolveCommittedProgress", () => {
  it("binds lineage proof to the caller's exact captured live HEAD", async () => {
    const { exec, calls } = fakeExec((key) => {
      if (key === `rev-parse --verify ${SEED_SHA}^{commit}`) return `${SEED_SHA}\n`;
      if (key === `rev-parse --verify ${HEAD_SHA}^{commit}`) return `${HEAD_SHA}\n`;
      if (key === `merge-base ${SEED_SHA} ${HEAD_SHA}`) return `${SEED_SHA}\n`;
      if (key === `diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`) return "";
      throw new Error(`unexpected git args: ${key}`);
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA, currentHead: HEAD_SHA });

    expect(result?.advanced).toBe(true);
    expect(calls).toContain(`rev-parse --verify ${HEAD_SHA}^{commit}`);
    expect(calls).not.toContain("rev-parse --verify HEAD^{commit}");
  });

  it("reports committed progress and changed files when HEAD advanced past the seed", async () => {
    const { exec } = fakeExec((key) => {
      if (key === `rev-parse --verify ${SEED_SHA}^{commit}`) return `${SEED_SHA}\n`;
      if (key === "rev-parse --verify HEAD^{commit}") return `${HEAD_SHA}\n`;
      if (key === `merge-base ${SEED_SHA} ${HEAD_SHA}`) return `${SEED_SHA}\n`;
      if (key === `diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`) {
        return "src/b.ts\0src/c.ts\0";
      }
      throw new Error(`unexpected git args: ${key}`);
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).not.toBeNull();
    expect(result?.advanced).toBe(true);
    expect([...(result?.files ?? [])].sort()).toEqual(["src/b.ts", "src/c.ts"]);
  });

  it("reports no progress and no files when HEAD is still at the seed head", async () => {
    const { exec, calls } = fakeExec((key) => {
      if (key === `rev-parse --verify ${SEED_SHA}^{commit}`) return `${SEED_SHA}\n`;
      if (key === "rev-parse --verify HEAD^{commit}") return `${SEED_SHA}\n`;
      throw new Error(`unexpected git args: ${key}`);
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toEqual({ advanced: false, files: new Set() });
    // merge-base / diff must not run once HEAD equals the seed head.
    expect(calls).not.toContain(`merge-base ${SEED_SHA} ${SEED_SHA}`);
  });

  it("reports no progress when the seed head is not a strict ancestor of HEAD", async () => {
    const OTHER = "1111111111111111111111111111111111111111";
    const { exec, calls } = fakeExec((key) => {
      if (key === `rev-parse --verify ${SEED_SHA}^{commit}`) return `${SEED_SHA}\n`;
      if (key === "rev-parse --verify HEAD^{commit}") return `${HEAD_SHA}\n`;
      if (key === `merge-base ${SEED_SHA} ${HEAD_SHA}`) return `${OTHER}\n`;
      throw new Error(`unexpected git args: ${key}`);
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toEqual({ advanced: false, files: new Set() });
    // A diverged seed head is not committed progress — no diff is taken.
    expect(calls).not.toContain(`diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`);
  });

  it("returns null for a malformed seed head without invoking git", async () => {
    const { exec, calls } = fakeExec(() => {
      throw new Error("git must not be called for a malformed seed head");
    });

    const result = await resolveCommittedProgress({ exec, seedHead: "not-a-sha" });

    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when the seed head cannot be verified as a commit", async () => {
    const { exec } = fakeExec((key) => {
      if (key === `rev-parse --verify ${SEED_SHA}^{commit}`) return "";
      throw new Error(`unexpected git args: ${key}`);
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toBeNull();
  });

  it("returns null when git fails", async () => {
    const { exec } = fakeExec(() => {
      throw new Error("fatal: not a git repository");
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toBeNull();
  });
});
