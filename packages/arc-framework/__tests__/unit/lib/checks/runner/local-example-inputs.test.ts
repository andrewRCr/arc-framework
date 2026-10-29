/** The independent example keeps native notice interpretation bounded to the initial file bytes. */
import { afterEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

async function exampleExport(module: string, name: string): Promise<unknown> {
  const loaded: unknown = await import(fileURLToPath(new URL(`../../../../../examples/check-runner/${module}`, import.meta.url)));
  if (typeof loaded !== "object" || loaded === null || !(name in loaded)) throw new Error(`Expected the independent example's ${name}`);
  return Reflect.get(loaded, name);
}

it("ignores a late not-run marker beyond the native notice-read boundary", async () => {
  const module: unknown = await import(fileURLToPath(new URL("../../../../../examples/check-runner/local-inputs.mjs", import.meta.url)));
  if (typeof module !== "object" || module === null || !("readChildNotice" in module) || typeof module.readChildNotice !== "function") {
    throw new Error("Expected the independent example's notice reader");
  }
  const readNotice = module.readChildNotice as (path: string, exitCode: number) => Promise<{ notice?: string; notRunReason?: string }>;
  const directory = await mkdtemp(join(tmpdir(), "arc-example-notice-"));
  directories.push(directory);
  const path = join(directory, "notice");
  await writeFile(path, "x".repeat(5000) + "\nnot run: late classification must be ignored\n");
  expect(await readNotice(path, 7)).toEqual({ notice: "x".repeat(200) });
});

it("refuses to associate work when Linux process identity cannot be observed", async () => {
  const module: unknown = await import(fileURLToPath(new URL("../../../../../examples/check-runner/local-process.mjs", import.meta.url)));
  if (typeof module !== "object" || module === null || !("ownerRecord" in module) || typeof module.ownerRecord !== "function") {
    throw new Error("Expected the independent example's ownership reader");
  }
  const owner = module.ownerRecord as (read: (pid: number) => Promise<undefined>) => Promise<unknown>;
  await expect(owner(async () => undefined)).rejects.toThrow(/process identity.*proc.*retry/iu);
});

it.each([
  { description: "running owner", observed: { birth: "same", state: "R" }, expected: true },
  { description: "sleeping owner", observed: { birth: "same", state: "S" }, expected: true },
  { description: "zombie owner", observed: { birth: "same", state: "Z" }, expected: false },
  { description: "dead owner", observed: { birth: "same", state: "X" }, expected: false },
  { description: "reused PID", observed: { birth: "another", state: "S" }, expected: false },
  { description: "missing owner", observed: undefined, expected: false },
])("reports $description accurately during retained attempt inspection", async ({ observed, expected }) => {
  const module: unknown = await import(fileURLToPath(new URL("../../../../../examples/check-runner/local-process.mjs", import.meta.url)));
  if (typeof module !== "object" || module === null || !("ownerAlive" in module) || typeof module.ownerAlive !== "function") {
    throw new Error("Expected the independent example's process ownership predicate");
  }
  const ownerAlive = module.ownerAlive as (record: { pid: number; birth: string },
    read: (pid: number) => Promise<{ birth: string; state: string } | undefined>) => Promise<boolean>;
  expect(await ownerAlive({ pid: 123, birth: "same" }, async () => observed)).toBe(expected);
});

it.runIf(process.platform !== "win32")("refuses a source link into the Git administration that capture replaces", async () => {
  const verifyInputs = await exampleExport("local-inputs.mjs", "verifyInputs") as (plan: unknown) => Promise<string>;
  const directory = await mkdtemp(join(tmpdir(), "arc-example-link-"));
  directories.push(directory);
  const root = join(directory, "root");
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, ".git", "config"), "generated metadata");
  await symlink(".git/config", join(root, "link"));
  const coordinates = { tree: "a".repeat(40), merged: [] };
  const encoding = JSON.stringify({ version: 1, coordinates, entries: [{ path: "link", kind: "symlink", target: ".git/config" }] });
  const manifest = join(directory, "manifest.json");
  await writeFile(manifest, encoding);
  const digest = `sha256:${createHash("sha256").update(encoding).digest("hex")}`;
  await expect(verifyInputs({ source: { root, manifest, digest, coordinates }, environment: {} }))
    .rejects.toThrow("Source symbolic link targets Git administration");
});

it("keeps a probe's leading byte order mark in known runtime qualification", async () => {
  vi.stubEnv("NODE_OPTIONS", "");
  vi.stubEnv("NODE_PATH", "");
  const qualify = await exampleExport("local-runtime.mjs", "qualifyNodeRuntime") as (plan: unknown,
    execute: () => Promise<unknown>) => Promise<{ kind: string; bindings?: { probes: { stdout: string }[] }[] }>;
  const plan = { environment: {}, invocations: [{ id: "check", cwd: ".", shell: false, argv: [process.execPath, "check.js"] }],
    probes: { global: [{ id: "probe", argv: [process.execPath, "-v"] }], check: [] } };
  const runtime = await qualify(plan, async () => ({ outcome: { status: "completed", exitCode: 0 },
    stdout: Buffer.from("\uFEFFversion"), overflow: false }));
  expect(runtime).toMatchObject({ kind: "known" });
  expect(runtime.bindings?.[0]?.probes[0]?.stdout).toBe("\uFEFFversion");
});

it.each([
  { name: "another executable", invocation: { argv: ["/usr/bin/env", "node", "check.js"] } },
  { name: "a shell command", invocation: { shell: true } },
  { name: "a custom module path", environment: { NODE_PATH: { kind: "value", state: "set", value: "/modules" } } },
  { name: "an unsupported startup option", environment: { NODE_OPTIONS: { kind: "value", state: "set", value: "--require ./hook.js" } } },
  { name: "probe stdout over the limit", overflow: true },
])("leaves the runtime unknown for $name", async ({ invocation = {}, environment = {}, overflow = false }) => {
  vi.stubEnv("NODE_OPTIONS", "");
  vi.stubEnv("NODE_PATH", "");
  const qualify = await exampleExport("local-runtime.mjs", "qualifyNodeRuntime") as (plan: unknown,
    execute: () => Promise<unknown>) => Promise<{ kind: string }>;
  const plan = (overrides: object, bindings: object) => ({ environment: bindings,
    invocations: [{ id: "check", cwd: ".", shell: false, argv: [process.execPath, "check.js"], ...overrides }],
    probes: { global: [{ id: "probe", argv: [process.execPath, "-v"] }], check: [] } });
  const execute = (exceeds: boolean) => async () => ({ outcome: { status: "completed", exitCode: 0 }, stdout: Buffer.from("v24"), overflow: exceeds });
  await expect(qualify(plan({}, {}), execute(false))).resolves.toMatchObject({ kind: "known" });
  await expect(qualify(plan(invocation, environment), execute(overflow))).resolves.toMatchObject({ kind: "unknown" });
});
