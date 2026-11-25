/** Checked and saved reads preserve the difference between empty and unavailable captured trees. */
import { describe, expect, it } from "vitest";
import type { StoreRecord, StoreResult } from "../../src/lib/store/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";

describe.each(["default", "separate"] as const)("captured read refusals in %s", layout => {
  it.each(["empty", "unavailable"] as const)("classifies an %s tree in saved and checked reads", async mode => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (armed) checked.push(await before.read({ reference: record.reference }), await after.read({ reference: record.reference }));
      return [];
    } } }, layout);
    const record = await seed(f, f.reference("work-item/meta"));
    const control = await seed(f, f.reference("personal/document"));
    const home = expandStoredPath(record.reference, { registry: f.ports.registry });
    const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const tip = (await f.ports.exec("git", [...args, "rev-parse", home.ref])).stdout.trim();
    if (mode === "empty") await plantRef(f.root, home.ref, [], { parents: [tip], gitDir: f.gitDir });
    const saved = success(await f.store.version());
    const tree = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}^{tree}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...args, "cat-file", "tree", tree])).stdout;
    if (mode === "unavailable") await removeLooseObject(f.root, tree, f.gitDir);
    expect(await f.store.read({ reference: record.reference, asOf: saved })).toMatchObject({ status: "refused", refusal: {
      code: mode === "empty" ? "not-found" : "state-unresolvable",
      ...(mode === "unavailable" ? { stateVersion: saved, historyRefs: [] } : {}),
    } });
    armed = true;
    success(await f.store.write(update(f, control)));
    expect(checked).toHaveLength(2);
    for (const result of checked) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: mode === "empty" ? "not-found" : "state-unresolvable" } });
      if (mode === "unavailable" && result.status === "refused") {
        expect(result.refusal.condition).toMatch(/unavailable/iu);
        expect(result.refusal.remedy.text).toMatch(/restore|fetch/iu);
      }
    }
    if (mode === "unavailable") {
      await f.ports.rawExec([...args, "hash-object", "-w", "-t", "tree", "--stdin"], { input: bytes });
      expect(success(await f.store.read({ reference: record.reference, asOf: saved }))).toEqual(record);
    }
  });
  it("restores lost metadata before named and UID-qualified checked reads recover", async () => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (armed) for (const view of [before, after]) checked.push(await view.read({ reference: named }), await view.read({ reference: record.reference }));
      return [];
    } } }, layout);
    const record = await seed(f, f.reference("work-item/meta"));
    const named = RecordReferenceSchema.parse({ ...record.reference, owner: { type: "work-item", name: record.reference.owner.name } });
    const control = await seed(f, f.reference("personal/document"));
    const home = expandStoredPath(record.reference, { registry: f.ports.registry }), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    await removeLooseObject(f.root, oid, f.gitDir);
    armed = true;
    success(await f.store.write(update(f, control)));
    expect(checked).toHaveLength(4);
    for (const result of checked) expect(result).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", class: "recoverable", historyRefs: [], remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
    const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
    expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    checked.length = 0;
    const current = success(await f.store.read({ reference: control.reference }));
    success(await f.store.write(update(f, current, `${current.content}\nRecovered check.\n`)));
    expect(checked).toHaveLength(4);
    for (const result of checked) expect(success(result)).toEqual(record);
  });
  it.each(["absent", "malformed"] as const)("keeps current and saved remedies for %s metadata", async mode => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (armed) for (const view of [before, after]) checked.push(await view.read({ reference: named }), await view.read({ reference: record.reference }));
      return [];
    } } }, layout);
    const record = await seed(f, f.reference("work-item/meta"));
    const named = RecordReferenceSchema.parse({ ...record.reference, owner: { type: "work-item", name: record.reference.owner.name } });
    const control = await seed(f, f.reference("personal/document"));
    const home = expandStoredPath(record.reference, { registry: f.ports.registry }), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const original = await capturedEntries(f, home.ref), parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
    const damaged = original.filter(entry => entry.path !== home.metadataPath);
    if (mode === "malformed") damaged.push({ path: home.metadataPath, content: "Malformed metadata" });
    const planted = await plantRef(f.root, home.ref, damaged, { parents: [parent], gitDir: f.gitDir });
    const saved = await f.settle();
    armed = true;
    success(await f.store.write(update(f, control)));
    expect(checked).toHaveLength(4);
    for (const result of checked) {
      expect(result).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref,
        remedy: { text: expect.stringMatching(/forward.*metadata/iu) },
      } });
      if (mode === "absent" && result.status === "refused") expect(result.refusal.condition).toContain("no metadata entry");
    }
    await plantRef(f.root, home.ref, original, { parents: [planted.tip], gitDir: f.gitDir });
    checked.length = 0;
    const current = success(await f.store.read({ reference: control.reference }));
    success(await f.store.write(update(f, current, `${current.content}\nRepaired metadata.\n`)));
    expect(checked).toHaveLength(4);
    for (const result of checked) expect(success(result)).toEqual(record);
    expect(await f.store.read({ reference: record.reference, asOf: saved })).toMatchObject({ status: "refused", refusal: {
      code: "namespace-corrupt", class: "terminal", remedy: { text: expect.stringMatching(/historical|ancestor/iu) },
    } });
  });
  it.each(["malformed", "missing-blob"] as const)("keeps record-free %s metadata distinct in checked and saved views", async mode => {
    let armed = false;
    const checked: StoreResult<StoreRecord>[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      if (armed) checked.push(await before.read({ reference: record.reference }), await after.read({ reference: record.reference }));
      return [];
    } } }, layout);
    const record = await seed(f, f.reference("work-item/meta")), control = await seed(f, f.reference("personal/document"));
    const home = expandStoredPath(record.reference, { registry: f.ports.registry }), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
    const original = await capturedEntries(f, home.ref), parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
    const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:${home.metadataPath}`])).stdout.trim();
    const bytes = (await f.ports.rawExec([...scope, "cat-file", "blob", oid])).stdout;
    const retained = mode === "malformed" ? [{ path: home.metadataPath, content: "Malformed metadata" }]
      : original.filter(entry => entry.path === home.metadataPath);
    const planted = await plantRef(f.root, home.ref, retained, { parents: [parent], gitDir: f.gitDir });
    const saved = await f.settle();
    if (mode === "missing-blob") await removeLooseObject(f.root, oid, f.gitDir);
    armed = true;
    success(await f.store.write(update(f, control)));
    expect(checked).toHaveLength(2);
    const code = mode === "malformed" ? "not-found" : "state-unresolvable";
    for (const result of checked) expect(result).toMatchObject({ status: "refused", refusal: { code, class: "recoverable" } });
    expect(await f.store.read({ reference: record.reference, asOf: saved })).toMatchObject({ status: "refused", refusal: { code } });
    if (mode === "missing-blob") {
      const restored = await f.ports.rawExec([...scope, "hash-object", "-w", "--stdin"], { input: bytes });
      expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
    }
    await plantRef(f.root, home.ref, original, { parents: [planted.tip], gitDir: f.gitDir });
    checked.length = 0;
    const current = success(await f.store.read({ reference: control.reference }));
    success(await f.store.write(update(f, current, `${current.content}\nReadable owner again.\n`)));
    expect(checked).toHaveLength(2);
    for (const result of checked) expect(success(result)).toEqual(record);
  });
});
