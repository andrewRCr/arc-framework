import { expect, it } from "vitest";

import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { seed, success } from "../helpers/store/suite-tools.js";

it.each(["default", "separate"] as const)("keeps an owner's live listing complete beside another owner's missing tree in %s", async layout => {
  const f = await createRefFixture({}, layout);
  const healthy = await seed(f, f.reference("work-item/meta", "healthy"));
  const sibling = await seed(f, f.reference("work-item/meta", "sibling"));
  await seed(f, RecordReferenceSchema.parse({ kind: "work-item/companion", owner: sibling.reference.owner,
    key: "nested/notes.md" }), "Sibling content.\n");
  const home = expandStoredPath(sibling.reference), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}:nested`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "tree", oid])).stdout;
  await removeLooseObject(f.root, oid, f.gitDir);
  const family = success(await f.store.list({ family: "work-item" }));
  expect(family).toMatchObject({ status: "complete", missed: true,
    diagnostics: [expect.objectContaining({ kind: "unreadable", key: home.ref })] });
  expect(success(await f.store.list({ family: "work-item", owner: healthy.reference.owner })))
    .toMatchObject({ status: "complete", records: [healthy], diagnostics: [], missed: false });
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", diagnostics: [], missed: false });
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout =>
  (["owner", "family"] as const).flatMap(scope => [false, true].map(withKind => ({ layout, scope, withKind })))))(
  "keeps a filtered-empty live $scope listing absent without changing saved filtering: kind=$withKind in $layout", async ({ layout, scope, withKind }) => {
  const f = await createRefFixture({}, layout);
  const record = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" });
  const asOf = await f.settle();
  const input = { family: "work-item" as const, ...scope === "owner" ? { owner: record.reference.owner } : {},
    ...withKind ? { kind: "work-item/meta" as const } : {} };
  expect(success(await f.store.list(input))).toMatchObject({ status: "complete", records: [record], diagnostics: [], missed: false });
  const filtered = { ...input, filter: { locations: ["completed" as const] } };
  expect(success(await f.store.list(filtered))).toMatchObject({ status: "absent", asOf });
  expect(success(await f.store.list({ ...filtered, asOf }))).toMatchObject({ status: "complete", records: [], diagnostics: [], missed: false, asOf });
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout =>
  (["owner", "family"] as const).flatMap(scope => [false, true].map(withKind => ({ layout, scope, withKind })))))(
  "keeps live empty $scope listings absent and saved absence kind-scoped: kind=$withKind in $layout", async ({ layout, scope, withKind }) => {
  const f = await createRefFixture({}, layout), record = await seed(f, f.reference("work-item/meta"));
  const home = expandStoredPath(record.reference), git = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const parent = (await f.ports.exec("git", [...git, "rev-parse", home.ref])).stdout.trim();
  await plantRef(f.root, home.ref, [], { parents: [parent], gitDir: f.gitDir });
  const asOf = await f.settle();
  const input = { family: "work-item" as const, ...scope === "owner" ? { owner: record.reference.owner } : {},
    ...withKind ? { kind: "work-item/meta" as const } : {} };
  expect(success(await f.store.list(input))).toMatchObject({ status: "absent", asOf });
  expect(success(await f.store.list({ ...input, asOf }))).toMatchObject(withKind ? { status: "absent", asOf }
    : { status: "complete", records: [], diagnostics: [], missed: false, asOf });
}, 60_000);

it.each((["default", "separate"] as const).flatMap(layout =>
  (["other-owner", "unknown-owner", "root-entry"] as const).flatMap(shape => [false, true].map(saved => ({ layout, shape, saved })))))(
  "scopes an ended owner's archive diagnostics beside $shape damage: saved=$saved in $layout", async ({ layout, shape, saved }) => {
  const f = await createRefFixture({}, layout), quarter = ArchiveQuarterSchema.parse("2026-q4");
  const ended = await seed(f, f.reference("work-item/meta", "selected"), undefined, { kind: "completed", quarter });
  const sibling = await seed(f, f.reference("work-item/meta", "sibling"), undefined, { kind: "completed", quarter });
  const expected = success(await f.store.read({ reference: ended.reference }));
  const home = expandStoredPath(sibling.reference, { placement: sibling.placement });
  const root = home.path.slice(0, home.path.indexOf("/") + 1), orphan = "unattributed-root";
  const entries = await capturedEntries(f, home.ref), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const parent = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
  const damaged = shape === "root-entry" ? [...entries, { path: orphan, content: "Unattributed evidence.\n" }]
    : entries.map(entry => entry.path === home.metadataPath
      ? { path: shape === "unknown-owner" ? `${root}metadata-unattributed.json` : entry.path, content: "{ invalid\n" } : entry);
  const broken = await plantRef(f.root, home.ref, damaged, { parents: [parent], gitDir: f.gitDir });
  const asOf = await f.settle(), input = { family: "work-item" as const, owner: ended.reference.owner };
  const diagnostic = expect.objectContaining({ key: `${home.ref}:${shape === "root-entry" ? orphan : root}` });
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: true,
    diagnostics: expect.arrayContaining([diagnostic]) });
  const wanted = { status: "complete", records: [expected], missed: shape !== "other-owner",
    diagnostics: shape === "other-owner" ? [] : [diagnostic] };
  const scopedInput = { ...input, ...saved ? { asOf } : {} };
  const selected = success(await f.store.list(scopedInput));
  expect(selected).toMatchObject(wanted);
  await plantRef(f.root, home.ref, entries, { parents: [broken.tip], gitDir: f.gitDir });
  expect(success(await f.store.list(input))).toMatchObject({ status: "complete", records: [expected], missed: false, diagnostics: [] });
  if (saved) expect(success(await f.store.list(scopedInput))).toEqual(selected);
}, 60_000);

it.each(["default", "separate"] as const)("ignores archive damage while the selected owner's live ref stands in %s", async layout => {
  const f = await createRefFixture({}, layout);
  const healthy = await seed(f, f.reference("work-item/meta", "healthy"));
  const sibling = await seed(f, f.reference("work-item/meta", "ended"), undefined,
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const home = expandStoredPath(sibling.reference, { placement: sibling.placement });
  const scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", `${home.ref}^{tree}`])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", "tree", oid])).stdout;
  await removeLooseObject(f.root, oid, f.gitDir);
  expect(success(await f.store.list({ family: "work-item" }))).toMatchObject({ status: "complete", missed: true,
    diagnostics: [expect.objectContaining({ kind: "unreadable", key: home.ref })] });
  expect(success(await f.store.list({ family: "work-item", owner: healthy.reference.owner })))
    .toMatchObject({ status: "complete", records: [healthy], diagnostics: [], missed: false });
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", "tree", "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await f.store.read({ reference: sibling.reference }))).toEqual(sibling);
}, 60_000);
