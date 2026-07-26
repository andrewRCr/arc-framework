/** `arc errand open` command-boundary coverage for unverifiable ancestry. */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../helpers/run-cli.js";
import { cleanupTempDir, createTempRepo, git, runArc } from "./helpers.js";

describe("arc errand open", () => {
  let repository: string | undefined;

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc(["init", "--yes", "--name", "errand-open-fixture"], repository);
    expect(initialized.exitCode).toBe(0);
    await git(repository, ["config", "arc.identity", "andrew"]);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
  });

  it("opens in partial mode and records unverifiable ancestry at unknown liveness", async () => {
    if (repository === undefined) throw new Error("fixture repository is unavailable");
    const configPath = join(repository, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace(/branch\.protection: (?:partial|full)/u, "branch.protection: partial"),
      "utf8",
    );

    const result = await runCli(["errand", "open", "unknown-anchor", "--json"], { cwd: repository });

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: "applied",
      operation: "errand-open",
      activeLocusPath: repository,
      sessionHomePath: repository,
    });
    const lociRoot = join(repository, ".arc", "user", "andrew", ".internal", "loci");
    const recordName = (await readdir(lociRoot)).find((name) => name.endsWith(".json"));
    expect(recordName).toBeDefined();
    const record = JSON.parse(await readFile(join(lociRoot, recordName as string), "utf8"));
    expect(record.lease.anchor).toMatchObject({ kind: "unverifiable" });
    expect(await git(repository, ["branch", "--show-current"])).toBe("main");
  });
});
