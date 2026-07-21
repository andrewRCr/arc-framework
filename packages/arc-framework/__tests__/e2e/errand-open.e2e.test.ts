/** `arc errand open` command-boundary and pre-mutation ancestry refusal. */

import { readFile, writeFile } from "node:fs/promises";
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
  });

  afterEach(async () => {
    if (repository !== undefined) await cleanupTempDir(repository);
  });

  it.each(["partial", "full"] as const)(
    "returns one JSON refusal before mutation when %s mode cannot establish a durable parent anchor",
    async (protection) => {
      if (repository === undefined) throw new Error("fixture repository is unavailable");
      const configPath = join(repository, ".arc", "system", "arc-config.yml");
      const config = await readFile(configPath, "utf8");
      await writeFile(
        configPath,
        config.replace(/branch\.protection: (?:partial|full)/u, `branch.protection: ${protection}`),
        "utf8",
      );

      const result = await runCli(["errand", "open", "safe-refusal", "--json"], { cwd: repository });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe("");
      expect(JSON.parse(result.stdout)).toMatchObject({
        outcome: "refused",
        operation: "errand-open",
        reason: "cold-entry-required",
      });
      expect(await git(repository, ["branch", "--show-current"])).toBe("main");
      expect(await git(repository, ["show-ref", "--verify", "--quiet", "refs/arc/user/andrew/errands"])
        .then(() => true, () => false)).toBe(false);
    },
  );
});
