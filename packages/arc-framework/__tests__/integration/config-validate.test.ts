/** Process-level integration coverage for `arc config validate`. */

import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { CONFIG_COMPATIBILITY_CASES } from "../fixtures/config/cases.js";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const tsxLoader = import.meta.resolve("tsx");
const packageRoot = join(testDir, "..", "..");
const cliPath = join(packageRoot, "src", "cli.ts");
const packagedArcRoot = join(packageRoot, "arc");
const launcherPath = join(packagedArcRoot, "system", ".internal", "scripts", "validate-config.sh");
const verifyIntegrityPath = join(packagedArcRoot, "system", ".internal", "scripts", "verify-integrity.sh");
const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "arc-config-validate-cli-"));
  roots.push(root);
  return root;
}

function runConfigValidate(cwd: string, args: string[] = []) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cliPath, "config", "validate", ...args], {
    cwd,
    encoding: "utf8",
  });
}

function sourceCliEnvironment(root: string): NodeJS.ProcessEnv {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(binDir, "arc"),
    [
      "#!/usr/bin/env bash",
      'exec "$ARC_TEST_NODE" --import "$ARC_TEST_TSX_LOADER" "$ARC_TEST_CLI" "$@"',
      "",
    ].join("\n"),
  );
  chmodSync(join(binDir, "arc"), 0o755);
  return {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    ARC_TEST_NODE: process.execPath,
    ARC_TEST_TSX_LOADER: tsxLoader,
    ARC_TEST_CLI: cliPath,
  };
}

// These cases spawn the CLI from source, where the staleness guard does not run
// at all — so any stderr at all is a real diagnostic worth failing on.
function expectCleanStderr(stderr: string): void {
  expect(stderr).toBe("");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("arc config validate", () => {
  it("resolves the default config from a nested project directory", () => {
    const root = fixtureRoot();
    const configDir = join(root, ".arc", "system");
    const nested = join(root, "nested", "deeper");
    mkdirSync(configDir, { recursive: true });
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(configDir, "arc-config.yml"), "branch.protection: full\n");

    const result = runConfigValidate(nested);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS  Config file exists: .arc/system/arc-config.yml");
    expect(result.stdout).toContain("PASS  branch.protection: full");
    expectCleanStderr(result.stderr);
  });

  it("resolves a relative explicit path outside an ARC root and preserves its token", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "selected.yml"), "unknown.setting: value\n");

    const result = runConfigValidate(root, ["--file", "selected.yml"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("PASS  Config file exists: selected.yml");
    expect(result.stdout).toContain("WARN  Unknown key: 'unknown.setting'");
    expect(result.stdout).not.toContain(join(root, "selected.yml"));
    expectCleanStderr(result.stderr);
  });

  it("preserves a whitespace-bearing explicit path token exactly", () => {
    const root = fixtureRoot();
    const selected = " selected.yml ";
    writeFileSync(join(root, selected), "branch.protection: full\n");

    const result = runConfigValidate(root, ["--file", selected]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`PASS  Config file exists: ${selected}`);
    expect(result.stdout).toContain("PASS  branch.protection: full");
    expectCleanStderr(result.stderr);
  });

  it("accepts an absolute explicit path and propagates validation errors", () => {
    const root = fixtureRoot();
    const selected = join(root, "absolute.yml");
    writeFileSync(selected, "branch.protection: impossible\n");

    const result = runConfigValidate(tmpdir(), ["--file", selected]);

    expect(result.status).toBe(2);
    expect(result.stdout).toContain(`PASS  Config file exists: ${selected}`);
    expect(result.stdout).toContain("ERROR branch.protection: 'impossible' is not valid");
    expectCleanStderr(result.stderr);
  });
});

describe("configuration compatibility corpus — process boundaries", () => {
  for (const fixture of CONFIG_COMPATIBILITY_CASES) {
    it(`${fixture.id}: direct command and launcher agree`, () => {
      const root = fixtureRoot();
      if (fixture.config !== null) writeFileSync(join(root, "selected.yml"), fixture.config);

      const direct = runConfigValidate(root, ["--file", "selected.yml"]);
      const launcher = spawnSync("bash", [launcherPath], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...sourceCliEnvironment(root),
          ARC_CONFIG_FILE: "selected.yml",
        },
      });

      expect(direct.status).toBe(fixture.expected.validator.exitCode);
      expect(launcher.status).toBe(fixture.expected.validator.exitCode);
      expect(launcher.stdout).toBe(direct.stdout);
      for (const line of fixture.expected.validator.lineIncludes) {
        expect(direct.stdout).toContain(line);
      }
      expectCleanStderr(direct.stderr);
      expectCleanStderr(launcher.stderr);
    }, 15_000);
  }

  it("validates a corpus config selected through a custom ARC_DIR", () => {
    const fixture = CONFIG_COMPATIBILITY_CASES.find(({ id }) =>
      id === "git-config-precedes-the-yaml-project-default");
    expect(fixture?.config).toBeTypeOf("string");

    const root = fixtureRoot();
    const customArcRoot = join(root, "custom-arc");
    cpSync(packagedArcRoot, customArcRoot, { recursive: true });
    writeFileSync(join(customArcRoot, "system", "arc-config.yml"), fixture?.config ?? "");

    const result = spawnSync("bash", [verifyIntegrityPath], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...sourceCliEnvironment(root),
        ARC_DIR: customArcRoot,
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.stdout).toContain(`PASS  Config file exists: ${customArcRoot}/system/arc-config.yml`);
    expect(result.stdout).toContain("PASS  user.notes_push: prompt");
    expect(result.stdout).toContain("PASS  Config validation clean");
    expect(result.stderr).toBe("");
  }, 15_000);
});
