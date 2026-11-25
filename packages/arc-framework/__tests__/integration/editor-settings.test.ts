/** Registered editor actions use the command's selected Store and preserve checkout JSONC. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { expect, it, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, remaining: 0 }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => {
    const selected = binding.remaining > 0 ? binding.store : null; binding.remaining -= 1;
    return selected ?? original.createStore(...args);
  } };
});

async function editor(cwd: string, store: Store, args: readonly string[], opens = 1) {
  const previousCwd = process.cwd(), previousExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = store; binding.remaining = opens; process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["editor", ...args]);
    return { output, exitCode: process.exitCode ?? 0 };
  } finally { out.mockRestore(); binding.store = null; binding.remaining = 0; process.chdir(previousCwd); process.exitCode = previousExit; }
}

it("writes and removes Zed settings through the selected reference Store without replacing custom settings", async () => {
  const cwd = await createTempRepo();
  try {
    const h = createLifecycleHarness(), exec = makeGitExec(cwd);
    await exec("git", ["config", "arc.identity", "andrew"]);
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
    const path = join(cwd, ".zed/settings.json");
    expect((await editor(cwd, h.store, ["zed"])).exitCode).toBe(0);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ file_scan_inclusions:
      ["...", ".arc/active/**", ".arc/backlog/**", ".arc/completed/**", ".arc/user/*/**"] });
    expect((await editor(cwd, h.store, ["zed", "--remove"])).exitCode).toBe(0);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({});
    expect((await editor(cwd, h.store, ["vscode", "--remove"])).exitCode).toBe(0);
    await expect(access(join(cwd, ".vscode/settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await cleanupTempDir(cwd); }
}, 30_000);

it("installs and removes the same checkout-root settings when invoked from a subdirectory", async () => {
  const cwd = await createTempRepo();
  try {
    const h = createLifecycleHarness(), exec = makeGitExec(cwd), nested = join(cwd, "src/nested");
    await exec("git", ["config", "arc.identity", "andrew"]);
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
    await mkdir(nested, { recursive: true });
    await mkdir(join(cwd, ".zed"));
    const path = join(cwd, ".zed/settings.json");
    await writeFile(path, '{"theme": "Custom", "file_scan_inclusions": ["..."]}');
    expect((await editor(nested, h.store, ["zed"], 2)).exitCode).toBe(0);
    await expect(access(join(nested, ".zed/settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ theme: "Custom", file_scan_inclusions:
      ["...", ".arc/active/**", ".arc/backlog/**", ".arc/completed/**", ".arc/user/*/**"] });
    expect((await editor(nested, h.store, ["zed", "--remove"], 2)).exitCode).toBe(0);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ theme: "Custom" });
  } finally { await cleanupTempDir(cwd); }
}, 30_000);

it("reports an invalid settings file without writing and succeeds once the same file is repaired", async () => {
  const cwd = await createTempRepo();
  try {
    const h = createLifecycleHarness(), exec = makeGitExec(cwd);
    await exec("git", ["config", "arc.identity", "andrew"]);
    await mkdir(join(cwd, ".vscode"));
    const path = join(cwd, ".vscode/settings.json"), malformed = '{"theme": }\n';
    await writeFile(path, malformed);
    const refused = await editor(cwd, h.store, ["vscode"]);
    expect(refused.exitCode).toBe(1);
    expect(refused.output).toContain("ValueExpected");
    expect(refused.output).toContain(".vscode/settings.json");
    expect(refused.output).toContain("retry");
    expect(await readFile(path, "utf8")).toBe(malformed);
    await writeFile(path, '{\n // Keep mine.\n "theme" : "Custom"\n}\n');
    expect((await editor(cwd, h.store, ["vscode"])).exitCode).toBe(0);
    const repaired = await readFile(path, "utf8");
    expect(repaired).toContain('// Keep mine.\n "theme" : "Custom"');
    expect(parse(repaired)).toMatchObject({ "files.readonlyFromPermissions": true });
  } finally { await cleanupTempDir(cwd); }
}, 30_000);
