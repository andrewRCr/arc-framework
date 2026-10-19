/** The registered join action reaches a selected-identity pull after real workspace setup. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (ports: Parameters<typeof original.createStore>[0]) => {
    return binding.store ?? original.createStore(ports);
  } };
});
vi.mock("../../src/lib/store/operational-sync.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/operational-sync.js")>();
  return { ...original, createStoreSyncPort: () => original.createStoreSyncPort({ pull: async () => {
    if (binding.store === null) throw new Error("No selected store");
    // The bound backend reads the records it would fetch for the selected identity.
    const { personalReference } = await import("../helpers/store/personal-fixture.js");
    const record = await binding.store.read({ reference: personalReference("personal/inbox", undefined, "alice") });
    if (record.status !== "ok") throw new Error(record.refusal.condition);
    return { status: "designation-needed", remote: "upstream", choices: ["state", "code"],
      remedy: { text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] } };
  } }) };
});
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createLifecycleHarness } from "../helpers/store/lifecycle-harness.js";
import { personalReference } from "../helpers/store/personal-fixture.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";

it("joins with CLI-selected identity, invokes the bound pull and reports designation without guessing", async () => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  const exec = makeGitExec(cwd);
  await exec("git", ["config", "arc.identity", "andrew"]);
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "pm.mode: none\n");
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const existingInbox = await h.seed(personalReference("personal/inbox", undefined, "alice"), "# USER-INBOX\n\nSelected Alice\n");
  binding.store = h.store;
  const originalCwd = process.cwd(), originalExit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    process.chdir(cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", "join", "--contributor", "--tools", "", "--identity", "alice"]);
    expect((await exec("git", ["config", "--get", "arc.identity"])).stdout.trim()).toBe("alice");
    const memory = await h.store.read({ reference: personalReference("personal/working-memory", undefined, "alice") });
    expect(memory).toMatchObject({ status: "ok", result: { content: expect.stringContaining("Working Memory") } });
    expect(await h.store.read({ reference: existingInbox.reference })).toEqual({ status: "ok", result: existingInbox });
    expect(output).toContain("Remote upstream needs a store designation.");
    expect(output).toContain("arc store remote upstream state");
    expect(process.exitCode).toBeUndefined();
  } finally { out.mockRestore(); binding.store = null; process.chdir(originalCwd); process.exitCode = originalExit; }
}, 30_000);
