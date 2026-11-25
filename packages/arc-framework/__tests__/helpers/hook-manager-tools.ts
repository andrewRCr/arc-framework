/** Pinned native hook tools for the E2E lane. */
import { execa } from "execa";
import { createRequire } from "node:module";
import { coerce, gte } from "semver";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../../src/lib/advisory-lock.js";

declare module "vitest" {
  interface ProvidedContext { arcHookManagerTools: HookManagerTools }
}

/** Absolute native executable paths shared with E2E workers. */
export interface HookManagerTools { lefthook: string; preCommit: string }
/** Process boundary returning captured standard output. */
export type ToolExec = (file: string, args: string[]) => Promise<string>;
const nativeExec: ToolExec = async (file, args) => (await execa(file, args, {
  timeout: 120_000, env: { FORCE_COLOR: "0", PIP_DISABLE_PIP_VERSION_CHECK: "1" },
})).stdout;

/**
 * Prepare pinned executable paths or refuse with provisioning guidance.
 * @param packageRoot - Package owning installed Lefthook platform dependencies
 * @param exec - Process boundary for native verification and Python provisioning
 * @param options - Explicit executable and cache locations for isolated fixtures
 * @returns Verified native executables ready for real hook installation
 */
export async function ensureHookManagerTools(
  packageRoot: string, exec: ToolExec = nativeExec,
  options: { lefthook?: string; cacheRoot?: string; python?: string } = {},
): Promise<HookManagerTools> {
  try {
    const require = createRequire(join(packageRoot, "package.json"));
    const platform = process.platform === "win32" ? "windows" : process.platform;
    const lefthook = options.lefthook ?? require.resolve(
      `lefthook-${platform}-${process.arch}/bin/lefthook${process.platform === "win32" ? ".exe" : ""}`);
    const version = coerce(await exec(lefthook, ["version"]));
    if (!version || !gte(version, "2.2.1")) throw new Error("lefthook requires version 2.2.1 or later");
    return { lefthook, preCommit: await cachedPreCommit(exec, options) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Hook-manager E2E provisioning failed")) throw error;
    throw new Error("Hook-manager E2E provisioning failed: lefthook. Run npm ci to install the pinned platform binary (2.2.1 or later).",
      { cause: error });
  }
}

async function cachedPreCommit(exec: ToolExec, options: { cacheRoot?: string; python?: string }): Promise<string> {
  const python = options.python ?? (process.platform === "win32" ? "python" : "python3");
  try {
    const identity = await exec(python, ["-c", "import json,sys;print(json.dumps({'executable':sys.executable,'version':sys.version}))"]);
    const key = createHash("sha256").update(`${process.platform}:${process.arch}:${identity}:4.4.0`).digest("hex");
    const cache = options.cacheRoot ?? join(tmpdir(), "arc-e2e-hook-tools");
    await mkdir(cache, { recursive: true });
    const lock = await acquireAdvisoryLock(join(cache, `${key}.lock`), { maxWaitMs: 180_000 });
    try {
      const environment = join(cache, key);
      const bin = join(environment, process.platform === "win32" ? "Scripts" : "bin");
      const executable = join(bin, process.platform === "win32" ? "pre-commit.exe" : "pre-commit");
      if (!await pinnedPreCommit(executable, exec)) {
        await rm(environment, { recursive: true, force: true });
        await exec(python, ["-m", "venv", environment]);
        await exec(join(bin, process.platform === "win32" ? "python.exe" : "python"),
          ["-m", "pip", "install", "--no-input", "--disable-pip-version-check", "--no-cache-dir", "pre-commit==4.4.0"]);
        if (!await pinnedPreCommit(executable, exec)) throw new Error("Installed pre-commit did not report version 4.4.0");
      }
      return executable;
    } finally { await releaseAdvisoryLock(lock); }
  } catch (error) {
    throw new Error(`Hook-manager E2E provisioning failed: pre-commit (4.4.0), using ${python}. `
      + `Install Python with venv and pip, then rerun the E2E command. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error });
  }
}

async function pinnedPreCommit(executable: string, exec: ToolExec): Promise<boolean> {
  try { return coerce(await exec(executable, ["--version"]))?.version === "4.4.0"; }
  catch { return false; }
}
