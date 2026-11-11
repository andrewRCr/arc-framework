/** Current-state recovery preserves edits and never fetches history for an expired projection anchor. */
import { join } from "node:path";
import { readFile, rm } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { HistoryRefSchema, StoreRefusalSchema } from "../../../../src/lib/store/index.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

for (const mode of ["write-back", "save"] as const) for (const namedHistory of [false, true]) {
  it(`rebuilds an expired anchor ${namedHistory ? "naming history" : "without history"} in ${mode} mode and keeps an edit`, async () => {
    const other = ".arc/user/andrew/scratch/neighbour.md";
    const h = await createEngineFixture(directories, { extraPaths: [other] });
    await startProjection({ checkout: h.checkout, store: h.store });
    await endProjection({ checkout: h.checkout, store: h.store });
    const neighbour = h.extra[0]?.record;
    if (neighbour === undefined) throw new Error("No fixture neighbour");
    const refreshed = "An unrelated stored change.\n";
    success(await h.store.write({ action: "put", reference: neighbour.reference, content: refreshed, expected: neighbour.version,
      provenance: { verb: "save", lifecycleAction: "save" } }));
    await h.edit("opening\nauthored before rebuild\nclosing\n");
    const source = createRefusingStore(h.store);
    source.refuse("changes", StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable",
      historyRefs: namedHistory ? [HistoryRefSchema.parse("refs/arc/history/work/00000000-0000-4000-8000-000000000001")] : [],
      condition: "The projection's lower state anchor no longer resolves.", remedy: { text: "Rebuild from current state." } }));
    const command = { checkout: h.checkout, store: source.store, mode };
    expect(await startProjection(command)).toMatchObject({ kind: "ready" });
    await endProjection(command);
    expect(parseStampedFile(await readFile(join(h.checkout, other), "utf8")).content).toBe(refreshed);
    expect((await h.stored()).content).toBe("opening\nauthored before rebuild\nclosing\n");
    expect(parseStampedFile(await h.file()).content).toBe("opening\nauthored before rebuild\nclosing\n");
    expect(source.calls("changes")).toBeGreaterThan(0);
    expect(source.calls("pull")).toBe(0);
  });
}

async function endedQuarter() {
  const h = await createAdoptionFixture({ placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2025-q1") } });
  directories.push(h.f.root);
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "An older note.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection({ checkout: h.f.root, store: h.f.store });
  await endProjection({ checkout: h.f.root, store: h.f.store });
  const lazy = await readProjectionIndex(h.projected.location, true, { groups: "walked" });
  if (lazy.kind !== "index") throw new Error("Missing projection index");
  expect(Object.keys(lazy.index.entries).some(path => path.startsWith(".arc/completed/"))).toBe(false);
  for (const record of [notes, h.primary]) success(await h.f.store.write({ action: "remove", reference: record.reference,
    expected: record.version, provenance: { verb: "fixture", lifecycleAction: "remove" } }));
  const refusing = createRefusingStore(h.f.store);
  refusing.refuse("changes", StoreRefusalSchema.parse({ code: "state-unresolvable", class: "recoverable", historyRefs: [],
    condition: "The lower anchor expired.", remedy: { text: "Rebuild from current state." } }));
  const paths = [`${h.folder}/meta-alpha.md`, `${h.folder}/notes-alpha.md`];
  const bytes = await Promise.all(paths.map(path => readFile(join(h.f.root, path), "utf8")));
  return { ...h, refusing, paths, bytes };
}

it("loads a settled cold quarter and removes its files when the complete current inventory is absent", async () => {
  const h = await endedQuarter();
  const command = { checkout: h.f.root, store: h.refusing.store };
  await startProjection(command);
  await endProjection(command);
  for (const path of h.paths) await expect(readFile(join(h.f.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const disk = await readProjectionIndex(h.projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing projection index");
  for (const path of h.paths) expect(disk.index.entries[path]).toBeUndefined();
  expect(disk.index.state).toBe(success(await h.f.store.version()));
});

it("removes an owner's old files when its re-lay listing answers absent", async () => {
  const h = await endedQuarter();
  const command = { checkout: h.f.root, store: h.f.store };
  await startProjection(command);
  await endProjection(command);
  for (const path of h.paths) await expect(readFile(join(h.f.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

for (const status of ["missed", "unreadable"] as const) {
  it(`keeps an absent quarter under a ${status} listing, then removes it after inventory repair`, async () => {
    const h = await endedQuarter();
    let repaired = false;
    const store = overrideEngineStore(h.refusing.store, { list: async input => {
      if (repaired || input.family !== "work-item") return h.f.store.list(input);
      return { status: "ok", result: status === "missed"
        ? { status: "complete", records: [], diagnostics: [], missed: true }
        : { status: "unreadable", condition: "The work-item inventory cannot be read.", remedy: { text: "Repair the inventory." } } };
    } });
    const command = { checkout: h.f.root, store };
    await startProjection(command);
    await endProjection(command);
    expect(await Promise.all(h.paths.map(path => readFile(join(h.f.root, path), "utf8")))).toEqual(h.bytes);
    repaired = true;
    await startProjection(command);
    await endProjection(command);
    for (const path of h.paths) await expect(readFile(join(h.f.root, path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
}
