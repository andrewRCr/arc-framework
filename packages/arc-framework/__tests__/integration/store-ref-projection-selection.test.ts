/** Selection runs through the registered command and the native reference-backed start. */
import { expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Command } from "commander";
import type { Store } from "../../src/lib/store/contract.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import type { ProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { createEngineFixture, overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { onTestFinished } from "vitest";
import { withProjectionLock, PROJECTION_LOCK_FILE } from "../../src/lib/store/projection/lock.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../src/lib/renewable-lease.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { RecordReferenceSchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema, ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRecordRenderer } from "../../src/lib/store/projection/record-render.js";
import { createProjectionProtection } from "../../src/lib/store/projection/protection.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { workItemLayoutPlacement } from "../../src/lib/store/lifecycle-storage.js";
import { WorkUnitReadPlacementSchema } from "../../src/lib/store/placement.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
import { seed, success } from "../helpers/store/suite-tools.js";

const binding = vi.hoisted(() => ({ store: null as Store | null, ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
});

vi.mock("../../src/lib/store/projection/engine-ports.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/projection/engine-ports.js")>();
  return { ...original, createProjectionEnginePorts: (...args: Parameters<typeof original.createProjectionEnginePorts>) => {
    const ports = original.createProjectionEnginePorts(...args);
    return binding.ports?.(ports) ?? ports;
  } };
});

async function fixture() {
  const directories: string[] = [], h = await createEngineFixture(directories, { kind: "work-item/notes" });
  onTestFinished(async () => { binding.ports = null; await removeGitBackedDirs(directories); });
  return h;
}
function refusal(output: string, condition: string, remedy: string) {
  expect(JSON.parse(output)).toMatchObject({ status: "refused", refusal: {
    condition: expect.stringContaining(condition), remedy: { text: expect.stringContaining(remedy) },
  } });
}

async function selection(store: Store, checkout: string, args: readonly string[] = [], configure?: (program: Command) => void) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = store; process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["selection", ...args], configure);
    return { output, exitCode: process.exitCode ?? 0 };
  } finally { binding.store = null; out.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("lists the own Markdown after take-in, limits changed paths, and shares text and JSON output", async () => {
  const { f, projected, primary } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(projected.index.entries)[0];
  if (path === undefined) throw new Error("No own metadata");
  expect(await selection(f.store, f.root, ["--changed", "--json"])).toEqual({ exitCode: 0, output: '{"paths":[]}\n' });
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nA selected correction.\n`);
  const selected = await selection(f.store, f.root, ["--changed", "--json"]);
  expect(selected.exitCode).toBe(0);
  expect(JSON.parse(selected.output)).toEqual({ paths: [path] });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("A selected correction.");
  expect(await selection(f.store, f.root)).toEqual({ exitCode: 0, output: `${path}\n` });
});

it("lists a new companion after the command start adopts it", async () => {
  const { f, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/research-alpha.md`;
  await mkdir(join(f.root, folder), { recursive: true });
  await writeFile(join(f.root, path), "# Research\n\nAn adopted note.\n");
  const selected = await selection(f.store, f.root, ["--changed", "--json"]);
  expect(selected.exitCode).toBe(0);
  expect(JSON.parse(selected.output)).toEqual({ paths: [path] });
  expect(Object.keys(projected.index.entries)).not.toContain(path);
});

it("refuses bypass and absent identity, then lists the same edit after repair", async () => {
  const h = await fixture();
  await h.edit("A correction awaiting take-in.\n");
  const skipped = await selection(h.store, h.checkout, ["--skip-projection", "--json"]);
  expect(skipped.exitCode).toBe(1); refusal(skipped.output, "--skip-projection", "without --skip-projection");
  expect((await h.stored()).content).not.toContain("A correction awaiting take-in.");
  await h.exec("git", ["config", "arc.identity", "BAD ID"], { cwd: h.checkout });
  const missing = await selection(h.store, h.checkout, ["--json"]);
  expect(missing.exitCode).toBe(1); refusal(missing.output, "identity", "arc.identity");
  await h.exec("git", ["config", "arc.identity", "andrew"], { cwd: h.checkout });
  expect(JSON.parse((await selection(h.store, h.checkout, ["--changed", "--json"])).output)).toEqual({ paths: [h.path] });
  expect((await h.stored()).content).toBe("A correction awaiting take-in.\n");
});

it("names the held lock's holder and lists the file after release", async () => {
  const h = await fixture();
  let release = (): void => {}, acquired = (): void => {};
  const entered = new Promise<void>(resolve => { acquired = resolve; });
  const holding = withProjectionLock(h.location, async () => { acquired(); await new Promise<void>(resolve => { release = resolve; }); });
  await entered;
  let seen = false;
  binding.ports = ports => ({ ...ports, maxWaitMs: 50, lock: { ...ports.lock, now: () => seen ? 1000 : 0,
    readFile: async path => { try { return await readFile(path, "utf8"); } finally { seen = true; } } } });
  try {
    const held = await selection(h.store, h.checkout, ["--json"]);
    expect(held.exitCode).toBe(1); refusal(held.output, "held", "Retry");
    expect(JSON.parse(held.output).refusal.condition).toContain(String(process.pid));
  } finally { release(); await holding; binding.ports = null; }
  expect(JSON.parse((await selection(h.store, h.checkout, ["--json"])).output)).toEqual({ paths: [h.path, ".arc/active/current/meta-work-item-one.md"] });
});

it("refuses a missing Git directory and lists the file once it is restored", async () => {
  const h = await fixture(), backup = `${h.location.gitDir}-saved`;
  await rename(h.location.gitDir, backup);
  try {
    const missing = await selection(h.store, h.checkout, ["--json"]);
    expect(missing.exitCode).toBe(1); refusal(missing.output, "Git directory is missing", "Retry");
  } finally { await rename(backup, h.location.gitDir); }
  expect(JSON.parse((await selection(h.store, h.checkout, ["--json"])).output)).toEqual({ paths: [h.path, ".arc/active/current/meta-work-item-one.md"] });
});

it("refuses a lost lease and lists the accepted edit on retry", async () => {
  const h = await fixture();
  await h.edit("Accepted before lease loss.\n");
  let now = Date.now(), replacement: AdvisoryLockHandle | undefined;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input);
    now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
    replacement = await acquireAdvisoryLock(join(h.location.stateDir, PROJECTION_LOCK_FILE), {
      pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
      leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
    });
    return result;
  } });
  binding.ports = ports => ({ ...ports, lock: { now: () => now, resolveProcessScope: async () => "original-scope", scheduleEvery: () => () => {} } });
  try {
    const lost = await selection(store, h.checkout, ["--json"]);
    expect(lost.exitCode).toBe(1); refusal(lost.output, "lease lost", "Retry");
    expect((await h.stored()).content).toBe("Accepted before lease loss.\n");
  } finally { if (replacement !== undefined) await releaseAdvisoryLockConfirmed(replacement); binding.ports = null; }
  expect(JSON.parse((await selection(h.store, h.checkout, ["--changed", "--json"])).output)).toEqual({ paths: [h.path] });
});

it("reads the completed index without loading records", async () => {
  const h = await fixture();
  const selected = await selection(h.store, h.checkout, ["--json"], program => program.hook("preAction", () => {
    vi.spyOn(h.store, "read").mockRejectedValue(new Error("Selection must not read stored content"));
    vi.spyOn(h.store, "list").mockRejectedValue(new Error("Selection must not list stored records"));
  }));
  expect(selected).toEqual({ exitCode: 0, output: `${JSON.stringify({ paths: [h.path, ".arc/active/current/meta-work-item-one.md"] })}\n` });
  vi.restoreAllMocks();
});

it.each(["unreadable", "missing", "other-format"])("refuses a %s index after start and lists the file once restored", async cause => {
  const h = await fixture(), path = join(h.location.stateDir, "index");
  const index = await readFile(path, "utf8");
  const damaged = await selection(h.store, h.checkout, ["--json"], program => program.hook("preAction", async () => {
    if (cause === "missing") await unlink(path);
    else await writeFile(path, cause === "other-format" ? '{"format":999}' : "broken");
  }));
  expect(damaged.exitCode).toBe(1); refusal(damaged.output, cause, "Restore");
  await writeFile(path, index);
  expect(JSON.parse((await selection(h.store, h.checkout, ["--json"])).output)).toEqual({ paths: [".arc/active/current/meta-work-item-one.md", h.path] });
});

it("selects owned in-flight Markdown and omits native protected, conflicted, and completed renderings", async () => {
  const { f, primary, projected } = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const beta = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beta" } }),
    makeMetaFixture("beta", { state: "Active", currentWorkflow: "process-task-loop", workClass: "Light", priority: "P1", owner: "andrew" }), { kind: "active" });
  const note = await seed(f, recordReferences["work-item/companion"](beta.reference.owner, "research"), "# Research\n\nAn owned note.\n");
  const conflict = await seed(f, recordReferences["work-item/companion"](primary.reference.owner, "conflicted"), "opening\nbase\nclosing\n");
  for (const content of ["opening\nstore side\nclosing\n", "opening\nincoming side\nclosing\n"]) {
    success(await f.store.write({ action: "put", reference: conflict.reference, content, expected: conflict.version,
      provenance: { verb: "save", lifecycleAction: "edit" } }));
  }
  const old = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "old" } }),
    makeMetaFixture("old", { state: "Shipped", currentWorkflow: null, workClass: "Light", priority: "P1", owner: "andrew" }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const placement = await workItemLayoutPlacement(f.root, "old", WorkUnitReadPlacementSchema.parse(old.placement), null);
  const own = Object.keys(projected.index.entries)[0];
  if (own === undefined) throw new Error("No own metadata");
  const paths = { own, note: ".arc/active/in-flight/beta/research-beta.md", protected: ".arc/active/in-flight/beta/meta-beta.md",
    conflict: ".arc/active/current/conflicted-alpha.md",
    old: resolveArcPath({ kind: "work-unit-artifact", slug: SlugSchema.parse("old"), placement, artifact: "meta" }) };
  await unlink(join(f.root, own));
  const seeded = await seedProjection({ checkout: f.root, store: f.store, files: [
    { reference: primary.reference, path: own }, { reference: beta.reference, path: paths.protected },
    { reference: note.reference, path: paths.note }, { reference: conflict.reference, path: paths.conflict }, { reference: old.reference, path: paths.old },
  ], renderer: checkout => createRecordRenderer({ store: f.store,
    protection: createProjectionProtection({ store: f.store, checkout, identity: SlugSchema.parse("andrew"), exec: createProjectionEnginePorts(checkout).exec }) }) });
  expect(seeded.index.entries[paths.protected]).toMatchObject({ protected: true });
  expect(seeded.index.entries[paths.conflict]).toMatchObject({ markers: expect.any(Object) });
  const selected = await selection(f.store, f.root, ["--json"]);
  expect(selected.exitCode).toBe(0);
  expect(JSON.parse(selected.output)).toEqual({ paths: [own, paths.note] });
});
