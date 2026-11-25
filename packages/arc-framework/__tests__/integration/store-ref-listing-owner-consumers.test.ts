import { expect, it } from "vitest";

import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { acquireLifecycleRecords, applyPreparedLifecycleWrite } from "../../src/lib/work-unit/prepared-lifecycle-write.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { mutationOf, seed, success, update } from "../helpers/store/suite-tools.js";

it.each((["default", "separate"] as const).flatMap(layout =>
  (["live-tree", "archive-tree"] as const).map(damage => ({ layout, damage }))))(
  "scopes before and after checks beside $damage damage while retaining kind-scoped view absence in $layout", async ({ layout, damage }) => {
  let armed = false, checked = false;
  const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
    if (!armed) return [];
    for (const view of [before, after]) {
      expect(success(await view.list({ family: "work-item", owner: selected.reference.owner })))
        .toMatchObject({ status: "complete", records: [selected], diagnostics: [], missed: false });
      expect(success(await view.list({ family: "review", owner: selected.reference.owner })))
        .toMatchObject({ status: "complete", records: [], diagnostics: [], missed: false });
      expect(success(await view.list({ family: "review", kind: "review/evidence", owner: selected.reference.owner })))
        .toMatchObject({ status: "absent" });
    }
    checked = true;
    return [];
  } } }, layout);
  const selected = await seed(f, f.reference("work-item/meta", "selected"));
  const sibling = await seed(f, f.reference("work-item/meta", "sibling"), undefined, damage === "archive-tree"
    ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  if (damage === "live-tree") await seed(f, RecordReferenceSchema.parse({ kind: "work-item/companion",
    owner: sibling.reference.owner, key: "nested/notes.md" }));
  const trigger = await seed(f, f.reference("personal/document"));
  const home = expandStoredPath(sibling.reference, { placement: sibling.placement });
  const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const query = damage === "live-tree" ? `${home.ref}:nested` : `${home.ref}^{tree}`;
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", query])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "tree", oid])).stdout;
  await removeLooseObject(f.root, oid, f.gitDir);
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: true });
  armed = true;
  success(await f.store.write(update(f, trigger)));
  expect(checked).toBe(true);
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await f.store.read({ reference: sibling.reference }))).toEqual(sibling);
}, 60_000);

it.each(["default", "separate"] as const)("applies a prepared lifecycle write beside another owner's unreadable ref in %s", async layout => {
  const f = await createRefFixture({}, layout), selected = await seed(f, f.reference("work-item/meta", "selected"));
  const sibling = await seed(f, f.reference("work-item/meta", "sibling"));
  await seed(f, RecordReferenceSchema.parse({ kind: "work-item/companion", owner: sibling.reference.owner, key: "nested/notes.md" }));
  const home = expandStoredPath(sibling.reference), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:nested`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "tree", oid])).stdout;
  await removeLooseObject(f.root, oid, f.gitDir);
  const records = success(await acquireLifecycleRecords(f.store, selected.reference)), write = update(f, selected);
  expect(records).toEqual([selected]);
  success(await applyPreparedLifecycleWrite(f.store, { records, writes: [mutationOf(write)] }, write.provenance));
  expect(success(await f.store.read({ reference: selected.reference })).content).toBe(write.content);
  await expect(f.ports.exec("git", [...scope, "cat-file", "-e", oid])).rejects.toBeDefined();
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await f.store.read({ reference: sibling.reference }))).toEqual(sibling);
}, 60_000);
