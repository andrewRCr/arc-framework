/** Registered setup commands use the requested person's Store before changing identity. */
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import type { StorePorts } from "../../src/lib/store/ports.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null, pull: null as null | (() => Promise<void>) }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (ports: StorePorts) => {
    if (binding.store === null) return original.createStore(ports);
    return binding.store;
  } };
});
vi.mock("../../src/lib/store/operational-sync.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/operational-sync.js")>();
  return { ...original, createStoreSyncPort: () => original.createStoreSyncPort({ pull: async () => {
    await binding.pull?.(); return { status: "pulled" };
  } }) };
});
const owner = OwnerIdentitySchema.parse({ type: "person", name: "alice" });
const inbox = recordReferences["personal/inbox"](owner), memory = recordReferences["personal/working-memory"](owner);
it.each(["add", "init", "join"])("registered %s creates only the missing record and warns when input is unavailable", async verb => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness();
  if (verb !== "init") {
    await mkdir(join(cwd, ".arc/system"), { recursive: true });
    await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  }
  await exec("git", ["config", "arc.identity", "configured-person"]);
  const existing = await h.seed(inbox, "# Inbox\n\n## Work Unit\n\n### **Keep Alice's capture**\n\n- _Id:_ `12345678`\n");
  let output = "";
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; process.chdir(cwd); process.exitCode = undefined;
    const argv = verb === "add" ? ["user", "add", "alice"] : verb === "join" ? ["join", "--tools", "", "--identity", "alice"]
      : ["init", "--name", "Example", "--tools", "", "--pm-mode", "none", "--identity", "alice"];
    await dispatchRegisteredCli(["--no-input", ...argv]);
    expect(lifecycleSuccess(await h.store.read({ reference: inbox }))).toEqual(existing);
    expect(lifecycleSuccess(await h.store.read({ reference: memory })).content).toContain("Working Memory");
    expect(output).toContain("Identity 'alice' already has personal records");
    await expect(access(join(cwd, ".arc/user/alice/USER-INBOX.md"))).rejects.toMatchObject({ code: "ENOENT" });
    if (verb !== "add") expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("alice");
    else expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("configured-person");
    expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); binding.store = null; binding.pull = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
it("join finds records supplied by pull before setting a previously absent identity", async () => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd), h = createLifecycleHarness();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "", pulledContent = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = h.store; binding.pull = async () => {
      await expect(exec("git", ["config", "--get", "arc.identity"])).rejects.toThrow();
      pulledContent = "# Inbox\n\n## Work Unit\n\n### **Pulled Alice capture**\n\n- _Id:_ `12345678`\n";
      await h.seed(inbox, pulledContent);
    };
    process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "join", "--tools", "", "--identity", "alice"]);
    expect(lifecycleSuccess(await h.store.read({ reference: inbox })).content).toBe(pulledContent);
    expect(output).toContain("Identity 'alice' already has personal records");
    expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("alice");
    expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); binding.store = null; binding.pull = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
it("registered legacy join retains its workspace seeds and no-input completion", async () => {
  const { readFile } = await import("node:fs/promises");
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = null; process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "join", "--tools", "", "--identity", "matrix"]);
    expect(await readFile(join(cwd, ".arc/user/matrix/USER-INBOX.md"), "utf8")).toContain("User Inbox");
    expect(await readFile(join(cwd, ".arc/user/matrix/WORKING-MEMORY.md"), "utf8")).toContain("Working Memory");
    expect(output).toContain("Workspace setup complete");
    expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
