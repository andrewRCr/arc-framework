import { expect, it } from "vitest";

import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

const objects = [
  { damage: "commit", byName: false }, { damage: "tree", byName: false },
  { damage: "metadata", byName: false }, { damage: "record", byName: false },
  { damage: "commit", byName: true }, { damage: "metadata", byName: true },
] as const;

it.each((["default", "separate"] as const).flatMap(layout => [false, true].flatMap(ended => objects.map(object => ({ layout, ended, ...object })))))(
  "routes a saved $damage loss by current tips: ended=$ended, byName=$byName, layout=$layout", async ({ layout, ended, damage, byName }) => {
  const f = await createRefFixture({}, layout);
  const record = await seed(f, f.reference("work-item/meta")), asOf = await f.settle();
  const home = expandStoredPath(record.reference), scope = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const tip = (await f.ports.exec("git", [...scope, "rev-parse", home.ref])).stdout.trim();
  const type = damage === "commit" ? "commit" : damage === "tree" ? "tree" : "blob";
  const query = damage === "commit" ? tip : damage === "tree" ? `${tip}^{tree}`
    : `${tip}:${damage === "metadata" ? home.metadataPath : home.path}`;
  const oid = (await f.ports.exec("git", [...scope, "rev-parse", query])).stdout.trim();
  const bytes = (await f.ports.rawExec([...scope, "cat-file", type, oid])).stdout;
  if (ended) success(await f.store.write({ ...update(f, record, record.content),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
  await removeLooseObject(f.root, oid, f.gitDir);
  const reference = byName ? RecordReferenceSchema.parse({ ...record.reference,
    owner: { type: "work-item", name: record.reference.owner.name } }) : record.reference;
  const result = await f.store.read({ reference, asOf });
  expect(result).toMatchObject({ status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", stateVersion: asOf,
    historyRefs: ended ? [home.ref.replace("refs/arc/", "refs/arc/history/")] : [],
    remedy: { text: expect.stringMatching(/(?:restore|fetch).*retry/iu) },
  } });
  const restored = await f.ports.rawExec([...scope, "hash-object", "-t", type, "-w", "--stdin"], { input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(oid);
  expect(success(await f.store.read({ reference, asOf }))).toEqual(record);
});
