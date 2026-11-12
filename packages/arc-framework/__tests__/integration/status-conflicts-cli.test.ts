/** The registered conflict mode reports the pre-cutover Git route. */
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished, vi } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { runHandlerAt } from "../helpers/handler.js";

import type { Store } from "../../src/lib/store/contract.js";
import { createStoreSyncPort } from "../../src/lib/store/operational-sync.js";
import type { StoreSyncPort } from "../../src/lib/store/operational-sync.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { seedStatusConflict } from "../helpers/store/status-conflicts.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { formatConflictToken } from "../../src/lib/status/conflict-token.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, sync: null as StoreSyncPort | null }));
vi.mock("../../src/handlers/status/session-context.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/handlers/status/session-context.js")>();
  return { ...original, createSessionStatusContext: (...args: Parameters<typeof original.createSessionStatusContext>) =>
    original.createSessionStatusContext(args[0], args[1], args[2], args[3], args[4], binding.store === null ? args[5]
      : { store: binding.store, ...(binding.sync === null ? {} : { sync: binding.sync }) }) };
});

async function fixture() {
  const cwd = await createTempRepo();
  onTestFinished(async () => { binding.store = null; binding.sync = null; await cleanupTempDir(cwd); });
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await makeGitExec(cwd)("git", ["config", "arc.identity", "alice"]);
  const f = createReferenceFixture(); f.identity("alice"); binding.store = f.store;
  return { ...f, cwd, run: (argv: string[]) => runHandlerAt(cwd, () => dispatchRegisteredCli(["--no-input", "status", ...argv])) };
}

it.each([false, true])("refuses the registered conflict mode before the capability flips (json=%s)", async json => {
  const cwd = await createTempRepo(); onTestFinished(() => cleanupTempDir(cwd));
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  const result = await runHandlerAt(cwd, () => dispatchRegisteredCli(["--no-input", "status", "--conflicts", ...(json ? ["--json"] : [])]));
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toMatch(/Error \[unsupported\]: .*git status/u);
  if (json) expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", refusal: { code: "unsupported", remedy: { text: expect.stringContaining("git status") } } });
  else expect(result.stdout).toBe("");
}, 30_000);


it("emits listed conflict records with tokens and string warnings as the registered JSON result", async () => {
  const f = await fixture(), records = [];
  for (const [kind, shape] of [["project-machinery/conflict-record", "hunk"], ["work-item/conflict-record", "record"], ["personal/conflict-record", "entry"]] as const) {
    const reference = f.reference(kind);
    const scoped = kind === "personal/conflict-record" ? { ...reference, owner: { ...reference.owner, name: "alice" } } : reference;
    records.push(await seedStatusConflict(f, RecordReferenceSchema.parse(scoped), shape));
  }
  const before = await readdir(f.cwd, { recursive: true });
  const output = await f.run(["--conflicts", "--json"]);
  expect(output.exitCode).toBe(0); expect(output.stderr).toBe("");
  const result = JSON.parse(output.stdout);
  expect(Object.keys(result).sort()).toEqual(["conflicts", "warnings"]);
  expect(result.conflicts).toHaveLength(3);
  expect(result.conflicts).toEqual(expect.arrayContaining(records.map(record => ({ ...record, token: formatConflictToken(record.reference) }))));
  expect(result.warnings).toEqual([]);
  expect(await readdir(f.cwd, { recursive: true })).toEqual(before);
}, 30_000);

it.each(["diagnostic", "missed"] as const)("retains a %s warning beside good records in text and JSON", async omission => {
  const f = await fixture(), good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  const list = f.store.list.bind(f.store);
  f.store.list = async input => {
    const result = await list(input);
    return input.family === "cohort" && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true, diagnostics: omission === "diagnostic"
        ? [{ kind: "unreadable", key: "lost", condition: "Conflict bytes unavailable.", remedy: { text: "Restore the bytes." } }] : [] } } : result;
  };
  const json = await f.run(["--conflicts", "--json"]), result = JSON.parse(json.stdout);
  expect(json.exitCode).toBe(0); expect(json.stderr).toBe("");
  expect(result.conflicts).toHaveLength(1);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain(omission === "diagnostic" ? "cohort lost: Conflict bytes unavailable. Restore the bytes." : "cohort conflict inventory is incomplete");
  const text = await f.run(["--conflicts"]);
  expect(text.exitCode).toBe(0);
  expect(text.stdout).toContain(formatConflictToken(good.reference));
  expect(text.stdout).toContain("Current: current"); expect(text.stdout).toContain("Incoming: incoming");
  expect(text.stderr).toBe(`warning: ${result.warnings[0]}\n`);
}, 30_000);


it.each([{ token: false, flags: ["--fetch"] }, { token: true, flags: ["--no-fetch", "--fetch"] }])("pulls once before acquiring list or token records: %j", async ({ token, flags }) => {
  const f = await fixture(), reference = f.reference("cohort/conflict-record", "fetched");
  binding.sync = createStoreSyncPort({ pull: async () => {
    await seedStatusConflict(f, reference);
    return { status: "pulled" };
  } });
  const result = await f.run(["--conflicts", ...(token ? [formatConflictToken(reference)] : []), ...flags, "--json"]);
  expect(result.exitCode).toBe(0); expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout).conflicts.map((record: { token: string }) => record.token)).toEqual([formatConflictToken(reference)]);
  expect(JSON.parse(result.stdout).warnings).toEqual([]);
}, 30_000);

it("retains a failed refresh's condition and remedy while rendering locally", async () => {
  const f = await fixture(); await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  binding.sync = createStoreSyncPort({ pull: async () => ({ status: "unreachable", condition: "State is offline.", remedy: { text: "Reconnect and retry." } }) });
  const result = await f.run(["--conflicts", "--fetch", "--json"]);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout).conflicts).toHaveLength(1);
  expect(JSON.parse(result.stdout).warnings).toEqual(["State is offline. Reconnect and retry."]);
}, 30_000);

it.each([[], ["--local", "--fetch"], ["--fetch", "--local"], ["--fetch", "--no-fetch"]].map(flags => ({ flags })))("keeps conflict acquisition local for $flags", async ({ flags }) => {
  const f = await fixture(), good = await seedStatusConflict(f, f.reference("cohort/conflict-record"));
  binding.sync = createStoreSyncPort({ pull: async () => { throw new Error("Local conflict status invoked a state pull"); } });
  const output = await f.run(["--conflicts", ...flags, "--json"]);
  expect(output.exitCode).toBe(0);
  expect(JSON.parse(output.stdout).conflicts.map((record: { token: string }) => record.token)).toEqual([formatConflictToken(good.reference)]);
}, 30_000);

it.each([false, true])("retains a failed token read's omission and repair route (json=%s)", async json => {
  const f = await fixture();
  f.store.list = async () => ({ status: "ok", result: { status: "complete", records: [], missed: true,
    diagnostics: [{ kind: "unreadable", key: "lost", condition: "Missing conflict bytes.", remedy: { text: "Restore those bytes." } }] } });
  const output = await f.run(["--conflicts", "cohort/cohort/missing/unknown", ...(json ? ["--json"] : [])]);
  expect(output.exitCode).toBe(1);
  expect(output.stderr).toContain("Missing conflict bytes. Restore those bytes.");
  expect(output.stderr).toContain("retry arc status --conflicts");
  expect(output.stderr).not.toContain("Unknown conflict token");
  if (json) expect(JSON.parse(output.stdout)).toMatchObject({ status: "refused", refusal: { code: "listing-unreadable",
    condition: expect.stringContaining("Missing conflict bytes. Restore those bytes."), remedy: { text: expect.stringContaining("arc status --conflicts") } } });
  else expect(output.stdout).toBe("");
}, 30_000);
