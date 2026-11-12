/** Related-unit feedback excludes specifications outside its configured projects. */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { load } from "js-yaml";
import { expect, it } from "vitest";
import { CheckDeclarationSchema } from "../../src/lib/checks/declaration.js";
import { gitExec } from "../../src/lib/io-context.js";

it.each([
  { path: "packages/arc-framework/__tests__/integration/example.test.ts", outcome: "not selected" },
  { path: "packages/arc-framework/__tests__/e2e/example.e2e.test.ts", outcome: "not selected" },
  { path: "packages/arc-framework/__tests__/unit/example.test.ts", outcome: "would run" },
  { path: "packages/arc-framework/src/example.ts", outcome: "would run" },
])("routes $path as $outcome for related-unit feedback", async ({ path, outcome }) => {
  const sourceRoot = resolve(import.meta.dirname, "../../../..");
  const root = await mkdtemp(resolve(tmpdir(), "arc-related-inputs-"));
  try {
    const declaration = CheckDeclarationSchema.parse(load(await readFile(resolve(sourceRoot, ".arc/system/arc-checks.yml"), "utf8")));
    await mkdir(resolve(root, ".arc/system"), { recursive: true });
    await mkdir(resolve(root, path, ".."), { recursive: true });
    await writeFile(resolve(root, path), "export const value = 1;\n");
    await writeFile(resolve(root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: { "test:changed": declaration.checks["test:changed"] } }));
    await writeFile(resolve(root, ".gitignore"), "node_modules/\n");
    await symlink(resolve(sourceRoot, "node_modules"), resolve(root, "node_modules"), "junction");
    for (const args of [["init", "-b", "main"], ["add", "-A"],
      ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-qm", "fixture"]]) {
      await gitExec("git", args, { cwd: root });
    }
    await writeFile(resolve(root, path), "export const value = 2;\n");
    const result = await execa(process.execPath, ["--import", "tsx", resolve(sourceRoot, "packages/arc-framework/src/cli.ts"),
      "check", "run", "test:changed", "--changed", "--dry-run", "--json"], { cwd: root, reject: false,
      env: { FORCE_COLOR: undefined } });
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(result.stdout).result.checks).toMatchObject([{ id: "test:changed", outcome }]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30_000);
