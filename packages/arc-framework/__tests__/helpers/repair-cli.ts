/** Real Git and actual Commander dispatch shared by the bounded repair matrix. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, onTestFinished, vi } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import type { StoreRecord } from "../../src/lib/store/read.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { InboxResultSchema } from "../../src/lib/inbox/types.js";
import { createTempRepo, cleanupTempDir, makeGitExec } from "./integration.js";
import { createInboxHarness } from "./inbox-harness.js";
import { seed, success } from "./store/suite-tools.js";
import { runArc } from "../e2e/helpers.js";
import { dispatchRegisteredCli } from "./registered-cli.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../src/lib/store/create.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});
export async function repairCliFixture(protection: "full" | "partial" = "full") {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  expect((await runArc(["init", "--yes", "--name", "test-project"], cwd)).exitCode).toBe(0);
  const configPath = join(cwd, ".arc/system/arc-config.yml");
  let config = await readFile(configPath, "utf8");
  for (const [key, value] of [["branch.protection", protection], ["branch.base", "main"], ["session.remote_sync", "disabled"]]) {
    const pattern = new RegExp(`^${key?.replaceAll(".", "\\.")}:.*$`, "mu");
    config = pattern.test(config) ? config.replace(pattern, `${key}: ${value}`) : `${config}\n${key}: ${value}\n`;
  }
  await writeFile(configPath, config);
  const exec = makeGitExec(cwd);
  await mkdir(join(cwd, ".git/repair-hooks"));
  await exec("git", ["config", "core.hooksPath", join(cwd, ".git/repair-hooks")]);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["add", "."]); await exec("git", ["commit", "-m", "Initialized project"]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  const h = createInboxHarness(); await h.inbox("project"); await h.inbox("personal", "");
  await seed(h.fixture, recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: randomUUID() })), "{}");
  const fixture = { cwd, exec, h, head: (await exec("git", ["rev-parse", "HEAD"])).stdout };
  return fixture;
}
export type RepairCliFixture = Awaited<ReturnType<typeof repairCliFixture>>;
export async function repairCli(f: RepairCliFixture, args: readonly string[], options: { stdin?: string; store?: Store } = {}) {
  const oldCwd = process.cwd(), oldExit = process.exitCode;
  let stdout = "", stderr = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { stdout += String(chunk); return true; });
  const err = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { stderr += String(chunk); return true; });
  const stdin = options.stdin === undefined ? null : vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(async function* (): AsyncGenerator<string, undefined> { yield options.stdin ?? ""; return undefined; });
  try {
    binding.store = options.store ?? f.h.context.store; process.chdir(f.cwd); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...args]);
    return { exitCode: process.exitCode, stdout, stderr, result: stdout.trim().startsWith("{") ? JSON.parse(stdout) as unknown : null };
  } finally { binding.store = null; stdin?.mockRestore(); out.mockRestore(); err.mockRestore(); process.chdir(oldCwd); process.exitCode = oldExit; }
}
export async function cliRows(f: RepairCliFixture, list: string) {
  const output = await repairCli(f, ["inbox", list, "--json"]);
  const result = InboxResultSchema.parse(output.result);
  if (result.state === "refused") throw new Error(`${result.reason} ${result.remedy.text}`);
  return result.entries;
}
export async function editRecord(f: RepairCliFixture, record: StoreRecord, content: string) {
  return success(await f.h.context.store.write({ action: "put", reference: record.reference, expected: record.version, content,
    provenance: { verb: "fixture-edit", lifecycleAction: "edit" } }));
}
