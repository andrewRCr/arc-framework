/** The package's published `arc` entry point starts the built CLI with Node's on-disk compile cache. */
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { assertCliBuilt, CLI_BUNDLE_PATH, CLI_PATH } from "../helpers/cli-spawn.js";

const execFileAsync = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, "../..");
const dirs: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "arc-cli-entry-"));
  dirs.push(dir);
  return dir;
}

async function cachedFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name));
}

async function version(entry: string, env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await execFileAsync(process.execPath, [entry, "--version"], { env, timeout: 30_000 });
  return stdout.trim();
}

/**
 * Point the system temporary directory, where Node puts its compile cache by default, at `temporary`. Setting
 * `NODE_COMPILE_CACHE` instead would turn the cache on by itself and hide whether the entry point turns it on.
 */
function environment(temporary: string, overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ARC_DISABLE_UPDATE_CHECKS: "1", NO_COLOR: "1" };
  delete env.NODE_COMPILE_CACHE;
  delete env.NODE_DISABLE_COMPILE_CACHE;
  return { ...env, TMPDIR: temporary, TMP: temporary, TEMP: temporary, ...overrides };
}

beforeAll(() => {
  assertCliBuilt();
});

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("arc's published entry point", () => {
  it("runs the built CLI and caches its compiled code", async () => {
    const expected = await version(CLI_BUNDLE_PATH, environment(await temporaryDirectory()));
    const temporary = await temporaryDirectory();

    expect(await version(CLI_PATH, environment(temporary))).toBe(expected);
    expect(await cachedFiles(temporary)).not.toHaveLength(0);
  });

  it("runs the built CLI without caching when the compile cache is turned off", async () => {
    const expected = await version(CLI_BUNDLE_PATH, environment(await temporaryDirectory()));
    const temporary = await temporaryDirectory();

    expect(await version(CLI_PATH, environment(temporary, { NODE_DISABLE_COMPILE_CACHE: "1" }))).toBe(expected);
    expect(await cachedFiles(temporary)).toHaveLength(0);
  });

  it("is the file the package's arc command names, and the package publishes it", async () => {
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
      bin: Record<string, string>;
      files: string[];
    };
    const command = manifest.bin.arc;

    expect(command).toBeDefined();
    expect(resolve(packageRoot, command ?? "")).toBe(CLI_PATH);
    expect(manifest.files).toContain(command?.split("/")[0]);
  });
});
