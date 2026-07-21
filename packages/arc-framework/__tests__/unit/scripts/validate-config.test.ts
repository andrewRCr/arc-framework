/** Unit coverage for the installed configuration-validation launcher. */

import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(testDir, "..", "..", "..", "..", "..");
const scriptPath = join(
  repoRoot,
  "packages/arc-framework/arc/system/.internal/scripts/validate-config.sh",
);
const packagedArcRoot = join(repoRoot, "packages/arc-framework/arc");
const verifyIntegrityPath = join(packagedArcRoot, "system/.internal/scripts/verify-integrity.sh");
const roots: string[] = [];

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
  argv: string[];
}

async function createArcShim(root: string): Promise<{ binDir: string; argvPath: string }> {
  const binDir = join(root, "bin");
  const argvPath = join(root, "argv");
  const shimPath = join(binDir, "arc");
  await mkdir(binDir, { recursive: true });
  await writeFile(
    shimPath,
    [
      "#!/usr/bin/env bash",
      "printf '%s\\n' \"$@\" > \"$ARC_SHIM_ARGV_FILE\"",
      "printf '%s' \"${ARC_SHIM_STDOUT:-}\"",
      "printf '%s' \"${ARC_SHIM_STDERR:-}\" >&2",
      "exit \"${ARC_SHIM_STATUS:-0}\"",
      "",
    ].join("\n"),
  );
  await chmod(shimPath, 0o755);
  return { binDir, argvPath };
}

async function runLauncher(options: {
  configFile?: string;
  stdout?: string;
  stderr?: string;
  status?: number;
} = {}): Promise<ScriptResult> {
  const root = await mkdtemp(join(tmpdir(), "arc-validate-config-launcher-"));
  roots.push(root);
  const { binDir, argvPath } = await createArcShim(root);

  return new Promise((resolveResult) => {
    execFile(
      "bash",
      [scriptPath],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          ARC_SHIM_ARGV_FILE: argvPath,
          ARC_SHIM_STDOUT: options.stdout ?? "",
          ARC_SHIM_STDERR: options.stderr ?? "",
          ARC_SHIM_STATUS: String(options.status ?? 0),
          ...(options.configFile === undefined ? {} : { ARC_CONFIG_FILE: options.configFile }),
        },
      },
      async (failure, stdout, stderr) => {
        const code = typeof failure?.code === "number" ? failure.code : 0;
        const argv = (await readFile(argvPath, "utf8")).trimEnd().split("\n");
        resolveResult({ code, stdout, stderr, argv });
      },
    );
  });
}

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("validate-config.sh", () => {
  it("delegates the default path to arc config validate", async () => {
    const result = await runLauncher({ stdout: "validator output\n" });

    expect(result).toEqual({
      code: 0,
      stdout: "validator output\n",
      stderr: "",
      argv: ["config", "validate", "--file", ".arc/system/arc-config.yml"],
    });
  });

  it("forwards an absolute selected path, output streams, and status", async () => {
    const selected = join(tmpdir(), "selected arc-config.yml");
    const result = await runLauncher({
      configFile: selected,
      stdout: "forwarded stdout\n",
      stderr: "forwarded stderr\n",
      status: 7,
    });

    expect(result).toEqual({
      code: 7,
      stdout: "forwarded stdout\n",
      stderr: "forwarded stderr\n",
      argv: ["config", "validate", "--file", selected],
    });
  });

  it("receives the config selected by verify-integrity for a custom ARC_DIR", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-validate-config-integrity-"));
    roots.push(root);
    const { binDir, argvPath } = await createArcShim(root);

    const result = await new Promise<{ stdout: string; stderr: string }>((resolveResult) => {
      execFile(
        "bash",
        [verifyIntegrityPath],
        {
          cwd: repoRoot,
          env: {
            ...process.env,
            PATH: `${binDir}:${process.env.PATH ?? ""}`,
            ARC_DIR: packagedArcRoot,
            ARC_SHIM_ARGV_FILE: argvPath,
            ARC_SHIM_STDOUT: "PASS  selected custom ARC root\n",
          },
        },
        (_failure, stdout, stderr) => resolveResult({ stdout, stderr }),
      );
    });

    expect((await readFile(argvPath, "utf8")).trimEnd().split("\n")).toEqual([
      "config",
      "validate",
      "--file",
      join(packagedArcRoot, "system", "arc-config.yml"),
    ]);
    expect(result.stdout).toContain("PASS  selected custom ARC root");
    expect(result.stdout).toContain("PASS  Config validation clean");
    expect(result.stderr).toBe("");
  });
});
