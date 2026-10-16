/** Missing terminal branch snapshots can be repaired once under exact tracked CAS, with immutable facts afterward. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { trackedWriteFixture, trackedDigest } from "../helpers/store/tracked-write-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { LineageRecordSchema, writeLineageRecord } from "../../src/lib/store/kinds/lineage/index.js";
import { resolveArcPath } from "../../src/lib/layout/index.js";
const provenance = { verb: "repair-lineage", lifecycleAction: "repair-lineage" };
const branches = [{ repository: "repo", ref: "chore/example", linkedAs: "adopted" as const, excluded: [] },
  { repository: "repo", ref: "feat/example", linkedAs: "created" as const, excluded: [] }];
async function fixture() {
  const h = await trackedWriteFixture(), reference = h.reference("lineage/transition");
  const lineage = LineageRecordSchema.parse({ schemaVersion: 2, origin: { name: "example" }, kind: "abandon", successors: [], incoming: [] });
  const content = writeLineageRecord(lineage);
  const created = success(await h.store.write({ action: "put", reference, expected: null, content, provenance: { verb: "abandon", lifecycleAction: "abandon" } }));
  const path = join(h.root, resolveArcPath({ kind: "transition-record", origin: reference.owner.name }));
  return { ...h, reference, path, content, lineage, created,
    repair: { action: "put" as const, reference, expected: created.version!, content: writeLineageRecord({ ...lineage, retiredBranches: branches }), provenance } };
}
describe("tracked terminal snapshot repair", () => {
  it("repairs the missing snapshot with original order, then refuses omission, changes, and whole-record removal", async () => {
    const h = await fixture(); const repaired = success(await h.store.write(h.repair));
    expect(success(await h.store.read({ reference: h.reference })).fields).toMatchObject({ retiredBranches: branches });
    expect(await h.store.write({ ...h.repair, expected: repaired.version!, content: h.content })).toMatchObject({ status: "refused" });
    expect(await h.store.write({ ...h.repair, expected: repaired.version!, content: writeLineageRecord({ ...h.lineage, retiredBranches: [] }) })).toMatchObject({ status: "refused" });
    expect(await h.store.write({ action: "remove", reference: h.reference, expected: repaired.version!, provenance })).toMatchObject({ status: "refused", refusal: { rule: "lineage.retired-branches" } });
    expect(await readFile(h.path, "utf8")).toBe(h.repair.content);
  });
  it("requires exact expected bytes and a trusted repair writer, keeping all other terminal facts immutable", async () => {
    const h = await fixture();
    expect(await h.store.write({ ...h.repair, expected: trackedDigest(h.content + "\n") })).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await h.store.write({ ...h.repair, provenance: { verb: "edit", lifecycleAction: "edit" } })).toMatchObject({ status: "refused" });
    const changed = LineageRecordSchema.parse({ ...h.lineage, kind: "decompose", successors: [{ name: "member" }], outgoing: [], retiredBranches: branches });
    expect(await h.store.write({ ...h.repair, content: writeLineageRecord(changed) })).toMatchObject({ status: "refused" });
    expect(await readFile(h.path, "utf8")).toBe(h.content);
    success(await h.store.write({ ...h.repair, provenance: { verb: "save", lifecycleAction: "save" } }));
  });
  it("restores exact old bytes after a repair writer changes the file and then fails", async () => {
    const h = await fixture(), original = h.ports.fs.writeFile;
    let injected = false;
    h.ports.fs.writeFile = async (path, bytes) => {
      await original(path, bytes);
      if (path === h.path && !injected) { injected = true; throw Error("injected repair failure after write"); }
    };
    await expect(h.store.write(h.repair)).rejects.toThrow("Operational state could not be read or written");
    expect(await readFile(h.path, "utf8")).toBe(h.content);
    success(await h.store.write(h.repair));
  });
  it("preserves an intervening byte generation observed at the repair writer's final CAS", async () => {
    const h = await fixture(), original = h.ports.fs.readFile; let reads = 0;
    const winning = h.content + "\n";
    h.ports.fs.readFile = async (path) => {
      if (path === h.path && ++reads === 2) await writeFile(path, winning);
      return original(path);
    };
    expect(await h.store.write(h.repair)).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
    expect(await readFile(h.path, "utf8")).toBe(winning);
  });
  it("keeps legacy snapshot-less lineage rollback available", async () => {
    const h = await fixture(); success(await h.store.write({ action: "remove", reference: h.reference, expected: h.created.version!, provenance: { verb: "rollback", lifecycleAction: "rollback" } }));
    expect(await h.store.read({ reference: h.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
