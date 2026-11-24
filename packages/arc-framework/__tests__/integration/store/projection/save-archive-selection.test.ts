/** Save finds indexed archive work without discovering new archive files or reading cold partitions. */
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { writeBackProjectionFiles } from "../../../../src/lib/store/projection/engine-files.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { formatConflictToken } from "../../../../src/lib/status/conflict-token.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { projectionCommand } from "../../../helpers/store/projection/command.js";
import { readFile, chmod, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { ProjectionSaveResult } from "../../../../src/lib/store/projection/save.js";
const binding = vi.hoisted(() => ({ store: null as Store | null, rejectArchiveWalk: false }));
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
vi.mock("../../../../src/lib/store/projection/engine-ports.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/projection/engine-ports.js")>();
  return { ...actual, createProjectionEnginePorts: (...args: Parameters<typeof actual.createProjectionEnginePorts>) => ({
    ...actual.createProjectionEnginePorts(...args), walkFs: { readdir: (path: string) => {
      if (binding.rejectArchiveWalk && path.replaceAll("\\", "/").includes("/.arc/completed")) throw new Error("Archive discovery is forbidden during save");
      return readdirSync(path, { withFileTypes: true });
    } },
  }) };
});
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
const directories: string[] = [];
afterEach(async () => { binding.store = null; binding.rejectArchiveWalk = false; await removeGitBackedDirs(directories.splice(0)); });
async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, path, store: h.f.store, checkout: h.f.root };
}
async function save(h: { store: Store; checkout: string }, args: readonly string[] = []): Promise<ProjectionSaveResult> {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  try {
    binding.store = h.store; process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["save", ...args, "--json"]);
    return JSON.parse(output) as ProjectionSaveResult;
  } finally { stdout.mockRestore(); stderr.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("leaves an invalid unmarked archive partition unread and walks no archive folder during a no-change save", async () => {
  const h = await fixture();
  const header = JSON.parse(await readFile(join(h.projected.location.stateDir, "index"), "utf8")) as {
    groups: Record<string, { name: string; unsettled: boolean }>;
  };
  const group = header.groups[".arc/completed/2026-q4"];
  if (group === undefined) throw new Error("No cold partition");
  expect(group.unsettled).toBe(false);
  const path = join(h.projected.location.stateDir, group.name);
  await writeFile(path, "Unread cold partition\n");
  binding.rejectArchiveWalk = true;
  expect(await save(h)).toMatchObject({ status: "ok" });
  expect(await readFile(path, "utf8")).toBe("Unread cold partition\n");
});

it("leaves a new archived file unadopted unless it was opened", async () => {
  const h = await fixture(), path = `${h.folder}/new-correction.md`, content = "A new archive correction.\n";
  await writeFile(join(h.checkout, path), content);
  expect(await save(h)).toMatchObject({ status: "ok" });
  expect(await h.store.read({ reference: recordReferences["work-item/companion"](h.primary.reference.owner, "new-correction.md") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await readFile(join(h.checkout, path), "utf8")).toBe(content);
});

it("retries a refusal left by a refresh in a marked archive partition without opening the file", async () => {
  const h = await fixture(), file = join(h.checkout, h.path), entry = h.projected.index.entries[h.path];
  if (entry?.kind !== "record") throw new Error("Missing archive entry");
  const remote = h.primary.content.replace("- **Next Action:** —", "- **Next Action:** Stored next action.");
  success(await h.store.write(update(h.f, h.primary, remote)));
  await chmod(file, 0o644);
  await writeFile(file, renderStampedFile({ content: h.primary.content + "\nA forced local correction.\n", stamp: entry.base.blob }));
  const fault = createRefusingStore(h.store);
  fault.refuse("batch", { code: "lock-held", class: "recoverable", lock: "archive", condition: "The writer is held.",
    remedy: { text: "Release the writer and retry arc save." } });
  const input = { store: fault.store, checkout: h.checkout };
  await startProjection(input); await endProjection(input);
  expect(await readProjectionIndex(h.projected.location, true, { groups: "all" })).toMatchObject({ kind: "index", index: {
    entries: { [h.path]: { pending: true, refused: expect.any(Object) } },
  } });
  await startProjection({ ...input, mode: "save" });
  const root = projectionProcessState().roots.get(h.checkout);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "walked" });
  if (root === undefined || disk.kind !== "index") throw new Error("Missing save binding");
  fault.refuse("batch", null);
  await withProjectionLock(h.projected.location, async session => {
    root.checkpoint = session.step;
    try { await writeBackProjectionFiles(root, disk.index, []); }
    finally { root.checkpoint = null; }
  });
  const content = success(await h.store.read({ reference: h.primary.reference })).content;
  expect(content).toContain("Stored next action.");
  expect(content).toContain("A forced local correction.");
});

it("names arc edit before the marker remedy for an unopened archive conflict and resolves after editing", async () => {
  const h = await fixture(), path = `${h.folder}/correction.md`;
  const record = await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "correction.md"), "opening\nbase\nclosing\n");
  for (const content of ["opening\ncurrent\nclosing\n", "opening\nincoming\nclosing\n"]) success(await h.store.write(update(h.f, record, content)));
  const current = success(await h.store.read({ reference: record.reference })), conflict = current.conflicts[0];
  if (conflict === undefined) throw new Error("Native writes made no conflict");
  const projected = await seedProjection({ store: h.store, checkout: h.checkout, files: [{ reference: record.reference, path }] });
  expect(projected.index.entries[path]).not.toHaveProperty("opened");
  expect(await readFile(join(h.checkout, path), "utf8")).toContain("<<<<<<<");
  const token = formatConflictToken(conflict), refused = await save(h, ["--resolve", token]);
  expect(refused).toMatchObject({ status: "refused", refusal: { remedy: { text: expect.stringContaining(`arc edit ${path}`) } } });
  await openArchivedProjectionFile(h, path);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing conflict index");
  const entry = disk.index.entries[path];
  if (entry?.kind !== "record") throw new Error("Missing subject");
  await writeFile(join(h.checkout, path), renderStampedFile({ content: current.content, stamp: entry.base.blob }));
  expect(await save(h, ["--resolve", token])).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: record.reference })).conflicts).toEqual([]);
});

it.each([false, true])("prints the saving checkout's remedy for a partly repaired archived entry list (opened=%s)", async opened => {
  const h = await fixture(), reference = recordReferences["work-item/inbound"](h.primary.reference.owner);
  const path = `${h.folder}/inbound-${h.primary.reference.owner.name}.md`;
  const base = "# Inbound\n\n## Inbound\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
    + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n";
  const record = await seed(h.f, reference, base);
  for (const side of ["stored first", "incoming first"]) success(await h.store.write(update(h.f, record, base.replace("base first", side))));
  const conflict = success(await h.store.read({ reference })).conflicts[0];
  if (conflict === undefined) throw new Error("Native writes made no conflict");
  await seedProjection({ store: h.store, checkout: h.checkout, files: [{ reference, path }] });
  const file = join(h.checkout, path), laid = await readFile(file, "utf8");
  expect(laid).toContain("<<<<<<<");
  if (opened) await openArchivedProjectionFile(h, path);
  else await chmod(file, 0o644);
  // One entry's markers lose their end line while another entry is edited, so the edit lands and the set is retained.
  await writeFile(file, laid.replace(/^>>>>>>>[^\n]*\n?/mu, "").replace("base second", "edited second"));
  const saved = await save(h, ["--resolve", formatConflictToken(conflict)]);
  if (saved.status !== "refused") throw new Error("The retained set was reported resolved");
  const remedy = saved.refusal.remedy.text;
  // The store replays the preparation without a worktree; the remedy printed is the saving checkout's own.
  expect(remedy).not.toContain(" from . ");
  if (opened) expect(remedy).not.toContain("arc edit");
  else expect(remedy).toContain(`Run arc edit ${path} from ${h.checkout} first. `);
  expect(success(await h.store.read({ reference })).content).not.toContain("edited second");
  if (opened) return;
  // The refusal left the entry unsettled, so a plain save sends it: the other entry lands and the set is retained.
  const sent = await projectionCommand({ store: h.store, checkout: h.checkout }, ["save"]);
  expect(sent.result).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference })).content).toContain("edited second");
  expect(sent.diagnostics).toContain(`Run arc edit ${path} from ${h.checkout} first. Finish resolving the affected set`);
  expect(sent.diagnostics).not.toContain(" from . ");
});

it("finishes an unopened accepted archive adoption and its interrupted recording at save", async () => {
  const h = await fixture(), path = `${h.folder}/interrupted.txt`, content = "Accepted archive prose.\n";
  await writeFile(join(h.checkout, path), content);
  const native = createProjectionEnginePorts(h.checkout);
  const input = { store: h.store, checkout: h.checkout, ports: () => ({ ...native, hooks: {
    afterMove: async (moved: string) => { if (moved === path) throw new Error("Stopped after accepted adoption"); },
  } }) };
  await startProjection(input);
  const root = projectionProcessState().roots.get(h.checkout);
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "walked" });
  if (root === undefined || disk.kind !== "index") throw new Error("Missing adoption binding");
  await expect(withProjectionLock(h.projected.location, async session => {
    root.checkpoint = session.step;
    try { await writeBackProjectionFiles(root, disk.index, [path]); }
    finally { root.checkpoint = null; }
  })).rejects.toThrow("Stopped after accepted adoption");
  const held = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing interrupted index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", adoption: { kind: "read-back" }, inProgress: expect.any(Object) });
  expect(held.index.entries[path]).not.toHaveProperty("opened");
  const reference = recordReferences["work-item/companion"](h.primary.reference.owner, "interrupted.txt");
  const version = success(await h.store.read({ reference })).version;
  expect(await save(h)).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference }))).toMatchObject({ content, version });
  const settled = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (settled.kind !== "index") throw new Error("Missing settled index");
  expect(settled.index.entries[path]).toMatchObject({ pending: false, inProgress: null });
  expect(settled.index.entries[path]).not.toHaveProperty("adoption");
  expect(parseStampedFile(await readFile(join(h.checkout, path), "utf8")).content).toBe(content);
});
