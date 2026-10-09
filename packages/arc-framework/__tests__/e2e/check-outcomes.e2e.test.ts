/** Native command outcomes remain actionable and preserve safe repair paths. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDeclaredCheckRepository } from "../fixtures/checks/repository.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { runArc } from "./helpers.js";

const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("names an invalid declaration field and succeeds after its repair", async () => {
  const root = await createDeclaredCheckRepository({ check: { gate: "commit", command: [] } });
  repositories.push(root);
  const invalid = await runArc(["check", "gate", "commit", "--json"], root);
  expect(invalid.exitCode, invalid.stderr).toBe(2);
  expect(JSON.parse(invalid.stdout).error).toMatchObject({ kind: "invalid", message: expect.stringContaining("checks.check.command") });
  await writeFile(join(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: {
    check: { gate: "commit", command: [process.execPath, "capture.cjs"] },
  } }));
  const repaired = await runArc(["check", "gate", "commit", "--json"], root);
  expect(repaired.exitCode, repaired.stderr).toBe(0);
  expect(JSON.parse(repaired.stdout).result.checks[0].outcome).toBe("passed");
  expect(JSON.parse(await readFile(join(root, "receipt.json"), "utf8")).cwd).toBe(root);
});

it.each([
  ["check", "run", "check", "--unknown"],
  ["check", "run", "check", "--all", "--staged"],
  ["check", "pre-commit", "--ci"],
  ["check", "gate"],
].map(args => ({ args })))("exits 2 for malformed input $args", async ({ args }) => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  const result = await runArc(args, root);
  expect(result.exitCode, result.stderr).toBe(2);
});

it.each([
  { args: ["check", "--help"], output: /Usage:/u },
  { args: ["--version"], output: /\d+\.\d+\.\d+/u },
])("keeps help and version successful for $args", async ({ args, output }) => {
  const root = await createDeclaredCheckRepository({});
  repositories.push(root);
  const result = await runArc(args, root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout).toMatch(output);
});

it("reports an empty gate as none declared with exit 0", async () => {
  const root = await createDeclaredCheckRepository({ later: {
    command: ["arc-check-outcomes-missing-command"], gate: "merge",
  } });
  repositories.push(root);
  const result = await runArc(["check", "gate", "commit"], root);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("none declared");
  expect(result.stdout).not.toContain("passed");
});
