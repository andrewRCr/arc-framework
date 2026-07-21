/** End-to-end bounded-termination proof for interaction-capable CLI commands. */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NO_INPUT_MATRIX } from "../fixtures/command-input/no-input-matrix.js";
import { cleanupTempDir, createTempRepo, git, runArcNoTty, runArcWithStdin } from "./helpers.js";

describe("command-input no-input matrix", () => {
  const repositories: string[] = [];

  afterEach(async () => {
    await Promise.all(repositories.splice(0).map((path) => cleanupTempDir(path)));
  });

  it.each(NO_INPUT_MATRIX)("terminates $commandPath with prompts and ambient stdin forbidden", async (entry) => {
    const cwd = await createTempRepo("arc-command-input-e2e-");
    repositories.push(cwd);
    const args = ["--no-input", ...entry.args];
    const options = { timeout: 10_000, env: { CI: "true" } };
    const result = entry.stdin === undefined
      ? await runArcNoTty(args, cwd, options)
      : await runArcWithStdin(args, cwd, entry.stdin, options);

    expect(Number.isInteger(result.exitCode)).toBe(true);
  });

  it("preserves explicitly selected commit-message stdin bytes", async () => {
    const cwd = await createTempRepo("arc-command-input-stdin-e2e-");
    repositories.push(cwd);
    const initialized = await runArcNoTty(
      ["--no-input", "init", "--name", "matrix", "--identity", "matrix"],
      cwd,
      { timeout: 10_000, env: { CI: "true" } },
    );
    expect(initialized.exitCode).toBe(0);
    const message = "feat(check): validate exact piped bytes\n\nContext: standalone (maintenance)\n";
    const result = await runArcWithStdin(
      ["--no-input", "check", "commit-msg", "-", "--json"],
      cwd,
      message,
      { timeout: 10_000, env: { CI: "true" } },
    );

    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ result: { kind: "validated", verdict: "pass" } });
  });

  it("preserves explicitly selected inbox-title stdin", async () => {
    const cwd = await createTempRepo("arc-command-input-inbox-e2e-");
    repositories.push(cwd);
    const initialized = await runArcNoTty(
      ["--no-input", "init", "--name", "matrix", "--identity", "matrix"],
      cwd,
      { timeout: 10_000, env: { CI: "true" } },
    );
    expect(initialized.exitCode).toBe(0);
    const configPath = join(cwd, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full"), "utf8");

    const result = await runArcWithStdin(
      ["--no-input", "errand", "open", "matrix-stdin", "--inbox-title-file", "-"],
      cwd,
      "Exact stdin title\n",
      { timeout: 10_000, env: { CI: "true" } },
    );

    expect(result.exitCode).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Exact stdin title");
    expect(await git(cwd, ["branch", "--show-current"])).toBe("main");
  });
});
