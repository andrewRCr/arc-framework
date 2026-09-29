import { describe, expect, it } from "vitest";

import { resolveCommittedProgress } from "../../../src/lib/recover/committed-progress.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

const SEED_SHA = "72d145021bf4166fa70efc5b9fd11916cf0a359a";
const HEAD_SHA = "aabbccddeeff00112233445566778899aabbccdd";

function progressExec(responses: Record<string, string | { failure: { exitCode: number; stderr: string } }>) {
  return scriptGitExec(Object.entries(responses).map(([key, response]) => ({
    match: key.split(" "),
    responses: [typeof response === "string" ? { stdout: response } : response],
  })));
}

describe("resolveCommittedProgress", () => {
  it("binds lineage proof to the caller's exact captured live HEAD", async () => {
    const { exec, calls } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: `${SEED_SHA}\n`,
      [`rev-parse --verify ${HEAD_SHA}^{commit}`]: `${HEAD_SHA}\n`,
      [`merge-base ${SEED_SHA} ${HEAD_SHA}`]: `${SEED_SHA}\n`,
      [`diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`]: "",
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA, currentHead: HEAD_SHA });

    expect(result?.advanced).toBe(true);
    expect(calls.map((call) => call.args.join(" "))).toContain(`rev-parse --verify ${HEAD_SHA}^{commit}`);
    expect(calls.map((call) => call.args.join(" "))).not.toContain("rev-parse --verify HEAD^{commit}");
  });

  it("reports committed progress and changed files when HEAD advanced past the seed", async () => {
    const { exec } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: `${SEED_SHA}\n`,
      "rev-parse --verify HEAD^{commit}": `${HEAD_SHA}\n`,
      [`merge-base ${SEED_SHA} ${HEAD_SHA}`]: `${SEED_SHA}\n`,
      [`diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`]: "src/b.ts\0src/c.ts\0",
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).not.toBeNull();
    expect(result?.advanced).toBe(true);
    expect([...(result?.files ?? [])].sort()).toEqual(["src/b.ts", "src/c.ts"]);
  });

  it("reports no progress and no files when HEAD is still at the seed head", async () => {
    const { exec, calls } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: `${SEED_SHA}\n`,
      "rev-parse --verify HEAD^{commit}": `${SEED_SHA}\n`,
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toEqual({ advanced: false, files: new Set() });
    // merge-base / diff must not run once HEAD equals the seed head.
    expect(calls.map((call) => call.args.join(" "))).not.toContain(`merge-base ${SEED_SHA} ${SEED_SHA}`);
  });

  it("reports no progress when the seed head is not a strict ancestor of HEAD", async () => {
    const OTHER = "1111111111111111111111111111111111111111";
    const { exec, calls } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: `${SEED_SHA}\n`,
      "rev-parse --verify HEAD^{commit}": `${HEAD_SHA}\n`,
      [`merge-base ${SEED_SHA} ${HEAD_SHA}`]: `${OTHER}\n`,
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toEqual({ advanced: false, files: new Set() });
    // A diverged seed head is not committed progress — no diff is taken.
    expect(calls.map((call) => call.args.join(" "))).not.toContain(`diff --name-only -z ${SEED_SHA}..${HEAD_SHA}`);
  });

  it("returns null for a malformed seed head without invoking git", async () => {
    const { exec, calls } = progressExec({});

    const result = await resolveCommittedProgress({ exec, seedHead: "not-a-sha" });

    expect(result).toBeNull();
    expect(calls).toEqual([]);
  });

  it("returns null when the seed head cannot be verified as a commit", async () => {
    const { exec } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: "",
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toBeNull();
  });

  it("returns null when git fails", async () => {
    const { exec } = progressExec({
      [`rev-parse --verify ${SEED_SHA}^{commit}`]: {
        failure: { exitCode: 128, stderr: "fatal: not a git repository" },
      },
    });

    const result = await resolveCommittedProgress({ exec, seedHead: SEED_SHA });

    expect(result).toBeNull();
  });
});
