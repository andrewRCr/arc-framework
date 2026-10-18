/** Registered join inputs exercise cancellation with injected terminal and Store ports. */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { JoinStorePorts } from "../../src/handlers/join.js";
const binding = vi.hoisted(() => ({ ports: null as JoinStorePorts | null }));
vi.mock("../../src/handlers/join.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/handlers/join.js")>();
  return { ...original, handleJoin: (...args: Parameters<typeof original.handleJoin>) =>
    original.handleJoin(args[0], args[1], binding.ports ?? args[2]) };
});
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { personalReference } from "../helpers/store/personal-fixture.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";

it("reports an unreachable pull while completing local setup and clears the warning after repair", async () => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "previous-person"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  let offline = true, output = "";
  binding.ports = { openStore: () => h.store, sync: () => createStoreSyncPort({ pull: async () => offline
    ? { status: "unreachable", condition: "State remote offline.", remedy: { text: "Reconnect the state remote, then retry join." } }
    : { status: "pulled" } }) };
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    process.chdir(cwd); process.exitCode = undefined;
    const argv = ["--no-input", "join", "--contributor", "--tools", "", "--identity", "alice"];
    await dispatchRegisteredCli(argv);
    expect(output).toContain("State remote offline.");
    expect(output).toContain("Reconnect the state remote, then retry join.");
    expect(output).toContain("Workspace setup complete"); expect(output).toContain("Done.");
    expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("alice");
    for (const kind of ["personal/inbox", "personal/working-memory"] as const) {
      expect(await h.store.read({ reference: personalReference(kind, undefined, "alice") })).toMatchObject({ status: "ok" });
    }
    expect(process.exitCode).toBeUndefined();
    offline = false; output = "";
    await dispatchRegisteredCli(argv);
    expect(output).not.toContain("State remote offline."); expect(output).not.toContain("Reconnect the state remote");
    expect(output).toContain("Workspace setup complete"); expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); binding.ports = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);

it("cancels designation before setup mutations and completes an explicitly answered retry", async () => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "previous-person"]);
  await exec("git", ["config", "arc.role", "maintainer"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const beforeConfig = (await exec("git", ["config", "--local", "--list"])).stdout;
  const beforeFiles = (await readdir(cwd)).sort();
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const beforeState = lifecycleSuccess(await h.store.version());
  let cancel = true, output = "";
  const designations = new Map<string, string>();
  binding.ports = { openStore: () => h.store,
    sync: () => createStoreSyncPort({ pull: async () => ({ status: "designation-needed", remote: "upstream", choices: ["state", "code"],
      remedy: { text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] } }) }),
    renderer: { confirm: async () => ({ kind: "answered", value: true }), text: async () => ({ kind: "cancelled" }), multiselect: async () => ({ kind: "cancelled" }),
      select: async (_context, question) => {
        if (cancel) return { kind: "cancelled" };
        const option = question.options.find(option => option.value === "code");
        if (!option) throw new Error("No explicit code choice");
        return { kind: "answered", value: option.value };
      } },
    execute: async ([command, family, verb, remote, role]) => {
      if (command !== "arc" || family !== "store" || verb !== "remote" || remote === undefined || role === undefined) throw new Error("Invalid designation");
      designations.set(remote, role);
    },
  };
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  const inTty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY"), outTty = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
  vi.stubEnv("CI", ""); vi.stubEnv("FORCE_COLOR", "0");
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    process.chdir(cwd); process.exitCode = undefined;
    const argv = ["join", "--contributor", "--tools", "", "--identity", "alice"];
    await dispatchRegisteredCli(argv);
    expect((await exec("git", ["config", "--local", "--list"])).stdout).toBe(beforeConfig);
    expect((await readdir(cwd)).sort()).toEqual(beforeFiles);
    expect(await readdir(join(cwd, ".arc"))).toEqual(["system"]);
    expect(lifecycleSuccess(await h.store.version())).toBe(beforeState);
    for (const kind of ["personal/inbox", "personal/working-memory"] as const) {
      expect(await h.store.read({ reference: personalReference(kind, undefined, "alice") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    }
    expect(designations.size).toBe(0);
    expect(output).not.toContain("Workspace setup complete"); expect(output).not.toContain("Done.");
    cancel = false; output = "";
    await dispatchRegisteredCli(argv);
    expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("alice");
    for (const kind of ["personal/inbox", "personal/working-memory"] as const) {
      expect(await h.store.read({ reference: personalReference(kind, undefined, "alice") })).toMatchObject({ status: "ok" });
    }
    expect([...designations]).toEqual([["upstream", "code"]]);
    expect(output).toContain("Workspace setup complete"); expect(output).toContain("Done.");
  } finally {
    out.mockRestore(); binding.ports = null; process.chdir(originalCwd); process.exitCode = originalExit;
    if (inTty) Object.defineProperty(process.stdin, "isTTY", inTty); else Reflect.deleteProperty(process.stdin, "isTTY");
    if (outTty) Object.defineProperty(process.stdout, "isTTY", outTty); else Reflect.deleteProperty(process.stdout, "isTTY");
    vi.unstubAllEnvs();
  }
}, 30000);
