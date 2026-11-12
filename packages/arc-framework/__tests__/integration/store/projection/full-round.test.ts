/** One linked repository keeps its layout and content through materialization, saves, pulls, sync, and recovery. */
import { Command } from "commander";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { configureEngineCheckout, createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { registerProjectionHooks } from "../../../../src/lib/store/projection/command-hooks.js";
import { materializeSpawnedProjection } from "../../../../src/lib/store/projection/spawn-materialization.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

const directories: string[] = [];
const ROUND_TIMEOUT_MS = 120_000;
afterEach(async () => { binding.store = null; beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

async function indexAt(checkout: string) {
  const location = await locateProjection(checkout, createProjectionEnginePorts(checkout));
  const disk = await readProjectionIndex(location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error(`Unusable projection at ${checkout}: ${disk.kind}`);
  return disk.index;
}

async function assertLayout(checkout: string, own: string, other: string): Promise<void> {
  const active = join(checkout, ".arc/active");
  expect((await readdir(active)).sort()).toEqual(["current", "in-flight"]);
  expect((await readdir(join(active, "current"))).sort()).toEqual([`meta-${own}.md`, `notes-${own}.md`]);
  expect(await readdir(join(active, "in-flight"))).toEqual([other]);
  expect((await readdir(join(active, "in-flight", other))).sort()).toEqual([`meta-${other}.md`, `notes-${other}.md`]);
  expect((await stat(join(checkout, ".arc/user/andrew/scratch/work-unit", own))).isDirectory()).toBe(true);
  const index = await indexAt(checkout);
  expect(index.entries[`.arc/active/current/notes-${own}.md`]).toMatchObject({ kind: "record", protected: false });
  expect(index.entries[`.arc/active/in-flight/${other}/notes-${other}.md`]).toMatchObject({ kind: "record", protected: false });
  expect(index.entries[`.arc/active/in-flight/${other}/meta-${other}.md`]).toMatchObject({ kind: "record", protected: true });
}

async function runSync(store: Store, checkout: string) {
  const cwd = process.cwd(), previousExit = process.exitCode;
  let output = "", errors = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(chunk => { errors += String(chunk); return true; });
  try {
    binding.store = store; process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["sync", "--json"]);
    return { output, errors, exitCode: process.exitCode ?? 0 };
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = previousExit; binding.store = null; }
}

it("keeps one linked repository coherent through complete projection operations", async () => {
  beginProjectionCommand();
  const own = "work-item-one", other = "work-item-two";
  const path = `.arc/active/current/notes-${own}.md`;
  const h = await createEngineFixture(directories, { kind: "work-item/notes", path });
  const peer = await seed(h, h.reference("work-item/meta", "two"), makeMetaFixture(other, {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }));
  await seed(h, recordReferences["work-item/notes"](peer.reference.owner), "A peer's notes.\n");
  await h.exec("git", ["config", "arc.inflightView", "all"], { cwd: h.checkout });
  await h.exec("git", ["add", ".gitignore", ".arc/user/.npmignore"], { cwd: h.checkout });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  await h.exec("git", ["branch", "-m", `feat/${own}`], { cwd: h.checkout });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-round-")); directories.push(parent);
  const checkout = join(parent, "peer");
  await h.exec("git", ["worktree", "add", "-b", `feat/${other}`, checkout, "HEAD"], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  await writeWorktreeMarker(checkout, { spawnedByArc: true, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(peer) });
  const store = withFanOut(h.store, createProjectionFanOutDependencies(h.checkout));
  const input = { checkout: h.checkout, store };
  const errors: string[] = [], program = new Command("arc").exitOverride();
  program.command("spawn-probe").action(() => materializeSpawnedProjection(checkout));
  registerProjectionHooks(program, { input: () => input, writeError: text => { errors.push(text); } });
  await program.parseAsync(["spawn-probe"], { from: "user" });
  expect(errors).toEqual([]);
  await assertLayout(h.checkout, own, other); await assertLayout(checkout, other, own);
  const peerFile = join(checkout, `.arc/active/in-flight/${own}/notes-${own}.md`);

  await h.edit("opening\nA hand edit in the writer.\nclosing\n");
  expect(await startProjection(input)).toMatchObject({ kind: "ready" }); await endProjection(input);
  expect((await h.stored()).content).toContain("A hand edit in the writer.");
  expect(await readFile(peerFile, "utf8")).toContain("A hand edit in the writer.");

  const remote = h.remote(true);
  if (remote === undefined) throw new Error("The reference fixture did not provide its remote writer");
  success(await store.push());
  const remoteBase = success(await remote.read({ reference: h.record.reference }));
  success(await remote.write({ action: "put", reference: remoteBase.reference, expected: remoteBase.version,
    content: "opening\nA remote change.\nclosing\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  success(await store.pull()); await endProjection(input);
  expect(await h.file()).toContain("A remote change.");
  expect(await readFile(peerFile, "utf8")).toContain("A remote change.");

  await rm(join(h.checkout, path));
  const synced = await runSync(store, h.checkout);
  expect(() => JSON.parse(synced.output)).not.toThrow();
  expect(synced.errors).not.toContain("Projection rebuild failed");
  expect(await h.file()).toContain("A remote change.");
  expect(await readFile(peerFile, "utf8")).toContain("A remote change.");

  const anchor = (await indexAt(h.checkout)).state;
  const before = await h.stored();
  success(await h.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: "opening\nCurrent content beyond the expired anchor.\nclosing\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const refusing = createRefusingStore(h.store);
  refusing.refuse("changes", { code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The lower projection anchor no longer resolves.", remedy: { text: "Rebuild from current state." } });
  const recovery = { checkout: h.checkout, store: refusing.store };
  expect(await startProjection(recovery)).toMatchObject({ kind: "ready" }); await endProjection(recovery);
  expect(await h.file()).toContain("Current content beyond the expired anchor.");
  expect((await indexAt(h.checkout)).state).toBe(success(await h.store.version()));
  expect((await indexAt(h.checkout)).state).not.toBe(anchor);
  await assertLayout(h.checkout, own, other);
  expect(projectionProcessState().diagnostics).toEqual([]);
  expect(refusing.calls("changes")).toBeGreaterThan(0);
  expect(refusing.calls("list")).toBeGreaterThan(0);
  expect(refusing.calls("pull")).toBe(0);
}, ROUND_TIMEOUT_MS);
