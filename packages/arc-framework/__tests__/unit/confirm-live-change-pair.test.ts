/** Shell-contract coverage for exact live pull-request/base pair confirmation. */

import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LIVE_PAIR_SCRIPT, runScript } from "../helpers/run-script.js";

const BASE = "a".repeat(40);
const HEAD = "b".repeat(40);

describe("confirm-live-change-pair.sh", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async (path) => await rm(path, {
      force: true,
      recursive: true,
    })));
  });

  async function environment(output: string, status = 0): Promise<NodeJS.ProcessEnv> {
    const directory = await mkdtemp(join(tmpdir(), "arc-live-pair-"));
    tempDirs.push(directory);
    const gh = join(directory, "gh");
    await writeFile(gh, String.raw`#!/usr/bin/env bash
printf '%s' "$LIVE_PAIR_OUTPUT"
exit "$LIVE_PAIR_STATUS"
`);
    await chmod(gh, 0o755);
    return {
      PATH: `${directory}:${process.env.PATH ?? ""}`,
      LIVE_PAIR_OUTPUT: output,
      LIVE_PAIR_STATUS: String(status),
    };
  }

  it("accepts only when both live operands still match", async () => {
    const result = await runScript(
      LIVE_PAIR_SCRIPT,
      ["owner/repo", "42", "main", BASE, HEAD],
      { env: await environment(`${HEAD}\t${BASE}\tOPEN\towner/repo`) },
    );

    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });
  });

  it.each([
    [`${"c".repeat(40)}\t${BASE}\tOPEN\towner/repo`, "head-moved"],
    [`${HEAD}\t${"c".repeat(40)}\tOPEN\towner/repo`, "base-moved"],
  ])("refuses a moved live pair", async (output, reason) => {
    const result = await runScript(
      LIVE_PAIR_SCRIPT,
      ["owner/repo", "42", "main", BASE, HEAD],
      { env: await environment(output) },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(reason);
  });

  it.each([
    [`${HEAD}\t${BASE}\tCLOSED\towner/repo`],
    [`${HEAD}\t${BASE}\tOPEN\tother/repo`],
  ])("refuses a change that is no longer live in the repository", async (output) => {
    const result = await runScript(
      LIVE_PAIR_SCRIPT,
      ["owner/repo", "42", "main", BASE, HEAD],
      { env: await environment(output) },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("change-not-live");
  });

  it("fails closed when the host pair cannot be read", async () => {
    const result = await runScript(
      LIVE_PAIR_SCRIPT,
      ["owner/repo", "42", "main", BASE, HEAD],
      { env: await environment("", 1) },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("live-pair-unreadable");
  });
});
