/** Provisioning refusals identify the unavailable tool and its repair. */
import { afterEach, expect, it } from "vitest";
import { ensureHookManagerTools } from "../helpers/hook-manager-tools.js";

it("fails with actionable guidance when Lefthook is unavailable", async () => {
  await expect(ensureHookManagerTools(import.meta.dirname, async () => {
    throw new Error("ENOENT");
  }, { lefthook: "/tools/lefthook" })).rejects.toThrow(/Hook-manager E2E provisioning failed.*lefthook.*npm ci/s);
});

it("refuses Lefthook older than the required native integration", async () => {
  await expect(ensureHookManagerTools(import.meta.dirname, async () => "2.1.17",
    { lefthook: "/tools/lefthook" })).rejects.toThrow(/lefthook.*2\.2\.1/s);
});

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("reuses a validated pinned virtual environment without installing again", async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "arc-hook-tools-"));
  roots.push(cacheRoot);
  const exec = async (_file: string, args: string[]): Promise<string> => {
    if (args[0] === "version") return "2.2.1";
    if (args[0] === "-c") return '{"executable":"/python3","version":"3.12.0"}';
    if (args[0] === "--version") return "pre-commit 4.4.0";
    throw new Error("Unexpected installation of valid cached environment");
  };
  const tools = await ensureHookManagerTools(import.meta.dirname, exec,
    { lefthook: "/tools/lefthook", cacheRoot });
  expect(tools.preCommit).toContain(cacheRoot);
  expect(tools.preCommit).toMatch(/pre-commit(?:\.exe)?$/);
});

it("repairs an incomplete cached environment and returns its pinned executable", async () => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "arc-hook-tools-"));
  roots.push(cacheRoot);
  let environment = "";
  const exec = async (file: string, args: string[]): Promise<string> => {
    if (args[0] === "version") return "2.2.1";
    if (args[0] === "-c") return '{"executable":"/python3","version":"3.12.0"}';
    if (args[0] === "--version") return await readFile(file, "utf8");
    if (args[1] === "venv") {
      environment = args[2] ?? "";
      await mkdir(join(environment, process.platform === "win32" ? "Scripts" : "bin"), { recursive: true });
      return "";
    }
    if (args[1] === "pip") {
      await writeFile(join(dirname(file), process.platform === "win32" ? "pre-commit.exe" : "pre-commit"), "pre-commit 4.4.0");
      return "";
    }
    throw new Error("Unexpected command");
  };
  const options = { lefthook: "/tools/lefthook", cacheRoot };
  const firstPromise = ensureHookManagerTools(import.meta.dirname, exec, options);
  await expect(firstPromise).resolves.toMatchObject({ preCommit: expect.any(String) });
  const first = await firstPromise;
  expect(environment).not.toBe("");
  expect(await readFile(first.preCommit, "utf8")).toBe("pre-commit 4.4.0");
  await writeFile(first.preCommit, "pre-commit 4.3.0");
  const repaired = await ensureHookManagerTools(import.meta.dirname, exec, options);
  expect(repaired.preCommit).toBe(first.preCommit);
  expect(await readFile(repaired.preCommit, "utf8")).toBe("pre-commit 4.4.0");
});

it.each(["Python", "pip"])("names %s provisioning failure and preserves a retry remedy", async tool => {
  const cacheRoot = await mkdtemp(join(tmpdir(), "arc-hook-tools-"));
  roots.push(cacheRoot);
  const exec = async (_file: string, args: string[]): Promise<string> => {
    if (args[0] === "version") return "2.2.1";
    if (args[0] === "-c" && tool === "pip") return '{"executable":"/python3","version":"3.12.0"}';
    if (args[1] === "venv") return "";
    throw new Error(`${tool} unavailable`);
  };
  await expect(ensureHookManagerTools(import.meta.dirname, exec,
    { lefthook: "/tools/lefthook", cacheRoot })).rejects.toThrow(
      new RegExp(`Hook-manager E2E provisioning failed: pre-commit.*venv and pip.*${tool} unavailable`, "s"));
});
