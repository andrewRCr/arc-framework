/** Declared selection checks consume the command's native ref-backed projection start. */
import { expect, it, vi } from "vitest";
import { mkdir, readFile, rename, symlink, writeFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { Store } from "../../src/lib/store/contract.js";
import type { ProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { withProjectionLock } from "../../src/lib/store/projection/lock.js";
import type { Command } from "commander";
import type { PathListSelection } from "../../src/lib/checks/path-list.js";

const binding = vi.hoisted(() => ({ store: null as Store | null,
  ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null }));
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

async function command(store: Store, root: string, argv: readonly string[], configure?: (program: Command) => void) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = store; process.chdir(root); process.exitCode = undefined;
    await dispatchRegisteredCli(argv, configure);
    return { output, exitCode: process.exitCode ?? 0 };
  } finally { binding.store = null; out.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  const path = Object.keys(h.projected.index.entries)[0];
  if (path === undefined) throw new Error("No metadata projection");
  await mkdir(join(h.f.root, ".arc/system"), { recursive: true });
  await writeFile(join(h.f.root, ".arc/system/arc-checks.yml"), JSON.stringify({ checks: {
    selected: { mode: "selection", inputs: ["**/*.md"], command: [process.execPath, "inspect.cjs"] },
  } }));
  await writeFile(join(h.f.root, "inspect.cjs"), "console.log(JSON.stringify({ paths: process.argv.slice(2) }));\n");
  return { ...h, path };
}

it("checks a changed file through the connected production reader", async () => {
  const { f, primary, path } = await fixture();
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nA changed note to check.\n`);
  const checked = await command(f.store, f.root, ["check", "run", "selected", "--changed", "--json"]);
  expect(checked.exitCode, checked.output).toBe(0);
  const check = JSON.parse(checked.output).result.checks[0];
  expect(check).toMatchObject({ outcome: "passed", record: { status: "not-recordable" } });
  expect(JSON.parse(check.output)).toEqual({ paths: [path] });
  expect(success(await f.store.read({ reference: primary.reference })).content).toContain("A changed note to check.");
});

it.each([false, true])("excludes an indexed file behind a directory-link=%s from both selection readers and checks until repair", async directoryLink => {
  const { f, primary, path } = await fixture();
  await writeFile(join(f.root, path), `${await readFile(join(f.root, path), "utf8")}\nA retained changed mark.\n`);
  expect(JSON.parse((await command(f.store, f.root, ["selection", "--changed", "--json"])).output)).toEqual({ paths: [path] });
  const link = directoryLink ? dirname(join(f.root, path)) : join(f.root, path);
  const backup = join(f.root, "regular-backup"), outside = join(f.root, "external-selection");
  await mkdir(outside);
  const target = join(outside, basename(path));
  await writeFile(target, "outside selection content\n");
  await rename(link, backup);
  await symlink(directoryLink ? outside : target, link, directoryLink ? "dir" : "file");
  const before = success(await f.store.version());
  for (const changed of [false, true]) {
    const observed: PathListSelection[] = [];
    const selected = await command(f.store, f.root, ["selection", "--json", ...(changed ? ["--changed"] : [])], program =>
      program.hook("preAction", async () => {
        const { readProjectedSelection } = await import("../../src/lib/checks/projected-selection.js");
        observed.push(await readProjectedSelection(f.root, { changed }));
      }));
    expect(selected.exitCode, selected.output).toBe(0);
    expect(JSON.parse(selected.output)).toEqual({ paths: [] });
    expect(observed).toEqual([{ status: "ok", paths: [] }]);
    const checked = await command(f.store, f.root, ["check", "run", "selected", "--json", ...(changed ? ["--changed"] : [])]);
    expect(checked.exitCode, checked.output).toBe(0);
    expect(JSON.parse(checked.output).result.checks).toMatchObject([{ outcome: "not selected", reason: "no files to check" }]);
  }
  expect(success(await f.store.version())).toBe(before);
  expect(success(await f.store.read({ reference: primary.reference })).content).not.toContain("outside selection");
  expect(await readFile(target, "utf8")).toBe("outside selection content\n");
  await unlink(link);
  await rename(backup, link);
  expect(JSON.parse((await command(f.store, f.root, ["selection", "--json"])).output)).toEqual({ paths: [path] });
  const repaired = await command(f.store, f.root, ["check", "run", "selected", "--changed", "--json"]);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(JSON.parse(repaired.output).result.checks).toMatchObject([{ outcome: "passed" }]);
});

it("leaves a changed file with native conflict markers out of selection checks", async () => {
  const { f, primary, path, projected } = await fixture();
  const record = await seed(f, recordReferences["work-item/companion"](primary.reference.owner, "research"), "opening\nbase\nclosing\n");
  const companion = ".arc/active/current/research-alpha.md";
  await unlink(join(f.root, path));
  await seedProjection({ checkout: f.root, store: f.store, files: [
    { reference: primary.reference, path }, { reference: record.reference, path: companion },
  ] });
  for (const content of ["opening\nstore side\nclosing\n", "opening\nincoming side\nclosing\n"]) {
    success(await f.store.write({ action: "put", reference: record.reference, content, expected: record.version,
      provenance: { verb: "save", lifecycleAction: "edit" } }));
  }
  await writeFile(join(f.root, companion), `${await readFile(join(f.root, companion), "utf8")}\nAn independent hand edit.\n`);
  const checked = await command(f.store, f.root, ["check", "run", "selected", "--changed", "--json"]);
  expect(checked.exitCode, checked.output).toBe(0);
  expect(JSON.parse(checked.output).result.checks).toMatchObject([{ outcome: "not selected", reason: "no files to check" }]);
  const { readProjectionIndex } = await import("../../src/lib/store/projection/index-file.js");
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("No checked projection");
  expect(disk.index.entries[companion]).toMatchObject({ changed: true, markers: expect.any(Object) });
});

it("reports the same held-lock evidence as selection and checks the file after release", async () => {
  const { f, projected } = await fixture();
  let release = (): void => {}, acquired = (): void => {};
  const entered = new Promise<void>(resolve => { acquired = resolve; });
  const holding = withProjectionLock(projected.location, async () => { acquired(); await new Promise<void>(resolve => { release = resolve; }); });
  await entered;
  binding.ports = ports => {
    let seen = false;
    return { ...ports, maxWaitMs: 50, lock: { ...ports.lock, now: () => seen ? 1000 : 0,
      readFile: async path => { try { return await readFile(path, "utf8"); } finally { seen = true; } } } };
  };
  try {
    const selected = await command(f.store, f.root, ["selection", "--json"]);
    const refusal = JSON.parse(selected.output).refusal;
    const checked = await command(f.store, f.root, ["check", "run", "selected", "--json"]);
    expect(checked.exitCode).toBe(2);
    expect(JSON.parse(checked.output).result.checks).toMatchObject([{ outcome: "couldn't run",
      reason: `${refusal.code}: ${refusal.condition}\n${refusal.remedy.text}` }]);
  } finally { release(); await holding; binding.ports = null; }
  const repaired = await command(f.store, f.root, ["check", "run", "selected", "--json"]);
  expect(repaired.exitCode, repaired.output).toBe(0);
  expect(JSON.parse(repaired.output).result.checks).toMatchObject([{ outcome: "passed" }]);
});

it("uses the matching completed start without recomposition or a subprocess, and isolates another checkout", async () => {
  const { f, path } = await fixture();
  const observed: PathListSelection[] = [];
  const selected = await command(f.store, f.root, ["selection", "--json"], program => program.hook("preAction", async () => {
    const { readProjectedSelection } = await import("../../src/lib/checks/projected-selection.js");
    observed.push(await readProjectedSelection(f.root, { changed: false }, {
      createStore: () => { throw new Error("Do not recompose this command's Store"); },
      run: () => Promise.reject(new Error("Do not launch a subprocess inside this command")),
    }));
    observed.push(await readProjectedSelection(`${f.root}-other`, { changed: false }, {
      createStore: () => ({ capabilities: { stateOffBranch: true } }),
      run: async (_command, _args, root) => ({ exitCode: 0, stdout: JSON.stringify({ paths: root.endsWith("-other") ? [] : [path] }), stderr: "" }),
    }));
  }));
  expect(selected.exitCode).toBe(0);
  expect(observed).toEqual([{ status: "ok", paths: [path] }, { status: "ok", paths: [] }]);
});
