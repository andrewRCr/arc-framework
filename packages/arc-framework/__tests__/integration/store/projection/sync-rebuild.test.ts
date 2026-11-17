/** Sync replaces an unusable partitioned index without losing unsent archive edits or copy bookkeeping. */
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { openArchivedProjectionFile } from "../../../helpers/store/projection/open-file.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { restoreSyncProjection } from "../../../../src/lib/store/projection/sync-materialization.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionReporter } from "../../../../src/lib/store/projection/report.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const deletion = vi.hoisted(() => ({ partition: "", header: "", blocked: false }));
vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rm: async (...args: Parameters<typeof actual.rm>) => {
    if (String(args[0]) === deletion.partition) {
      const header = JSON.parse(await actual.readFile(deletion.header, "utf8")) as { groups: Record<string, { name: string }> };
      if (Object.values(header.groups).some(group => group.name === basename(deletion.partition))) {
        deletion.blocked = true;
        throw Object.assign(new Error("A named partition cannot be deleted before recovery publication"), { code: "EACCES" });
      }
    }
    return actual.rm(...args);
  } };
});

const directories: string[] = [];
afterEach(async () => { deletion.partition = ""; deletion.header = ""; deletion.blocked = false; await removeGitBackedDirs(directories.splice(0)); });
async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } });
  directories.push(h.f.root);
  await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "cold" })),
    makeMetaFixture("cold", { owner: "andrew", state: "Shipped", currentWorkflow: null }),
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") });
  await rm(join(h.projected.location.stateDir, "index"));
  const input = { store: h.f.store, checkout: h.f.root };
  await startProjection(input); await endProjection(input);
  const path = Object.keys(h.projected.index.entries)[0]!;
  return { ...h, input, path, absolute: join(h.f.root, path) };
}
async function damage(h: Awaited<ReturnType<typeof fixture>>) {
  const header = JSON.parse(await readFile(join(h.projected.location.stateDir, "index"), "utf8")) as {
    groups: Record<string, { name: string; unsettled: boolean }>;
  };
  const group = header.groups[".arc/completed/2026-q3"];
  if (group === undefined || group.unsettled) throw new Error("Missing cold archive partition");
  deletion.partition = join(h.projected.location.stateDir, group.name);
  deletion.header = join(h.projected.location.stateDir, "index");
  await writeFile(deletion.partition, "Damaged cold partition\n");
  return group.name;
}

it.each([false, true])("rebuilds a mismatched cold quarter and preserves an opened edit when refused=%s", async refused => {
  const h = await fixture();
  await openArchivedProjectionFile(h.input, h.path);
  const content = (await readFile(h.absolute, "utf8")) + "\nAn opened correction.\n";
  await writeFile(h.absolute, content);
  const boundary = createRefusingStore(h.f.store);
  if (refused) boundary.refuse("batch", { code: "lock-held", class: "recoverable", lock: "archive",
    condition: "The archive writer is held.", remedy: { text: "Release the archive writer and retry arc save." } });
  const input = { ...h.input, store: boundary.store };
  await startProjection(input);
  await damage(h);
  await restoreSyncProjection(boundary.store, h.f.root, {});
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk.kind).toBe("index");
  if (disk.kind !== "index") throw new Error("Sync left no usable index");
  expect(deletion.blocked).toBe(false);
  expect(disk.index.entries[h.path]?.opened).toBeUndefined();
  expect(disk.index.entries[h.path]).toMatchObject({ withheld: refused });
  if (refused) {
    expect(await readFile(h.absolute, "utf8")).toBe(content);
    let report = ""; createProjectionReporter(boundary.store, text => { report += text; })();
    expect(report).toContain(h.path); expect(report).toContain("withheld");
  } else {
    expect(success(await h.f.store.read({ reference: h.primary.reference })).content).toContain("An opened correction.");
    expect((await stat(h.absolute)).mode & 0o200).toBe(0);
  }
  await endProjection(input);
});

it("keeps each live aside copy once when sync rebuilds after command start", async () => {
  const h = await fixture();
  await openArchivedProjectionFile(h.input, h.path);
  await writeFile(h.absolute, (await readFile(h.absolute, "utf8")) + "\nA landed correction.\n");
  const native = createProjectionEnginePorts(h.f.root);
  await startProjection({ ...h.input, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "sync-rebuild-live-writer" }) }) });
  const root = projectionProcessState().roots.get(h.f.root);
  if (root === undefined || root.copies.length === 0) throw new Error("No live aside copy");
  const retained = root.copies.map(copy => copy.copy);
  await damage(h);
  await restoreSyncProjection(h.f.store, h.f.root, {});
  const copies = root.copies.map(copy => copy.copy);
  expect(copies.length).toBe(new Set(copies).size);
  expect(copies).toEqual(expect.arrayContaining(retained));
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  expect(disk.kind).toBe("index");
  await endProjection(h.input);
});
