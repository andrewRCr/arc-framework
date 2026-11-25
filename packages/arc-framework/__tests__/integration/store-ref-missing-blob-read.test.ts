/** A locally unavailable record object remains distinct from an absent record. */
import { expect, it } from "vitest";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { removeLooseObject } from "../helpers/store/ref-plant.js";

it.each(["default", "separate"] as const)("refuses a missing blob by UID and by name, then reads after object restoration in %s", async layout => {
  const f = await createRefFixture({}, layout), primary = await seed(f, f.reference("work-item/meta"));
  const reference = RecordReferenceSchema.parse({ owner: primary.reference.owner, kind: "work-item/companion", key: "missing" });
  const content = "Unique missing companion bytes.\n";
  success(await f.store.write({ action: "put", reference, content, expected: null, provenance: testProvenance }));
  const home = expandStoredPath(reference, { registry: f.ports.registry });
  const args = f.gitDir ? [`--git-dir=${f.gitDir}`] : [];
  const oid = (await f.ports.exec("git", [...args, "rev-parse", `${home.ref}:${home.path}`])).stdout.trim();
  await removeLooseObject(f.root, oid, f.gitDir);
  const byName = RecordReferenceSchema.parse({ ...reference, owner: { type: "work-item", name: reference.owner.name } });
  for (const selected of [reference, byName]) {
    expect(await f.store.read({ reference: selected })).toMatchObject({ status: "refused", refusal: {
      code: "state-unresolvable", remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
  }
  await f.ports.rawExec([...args, "hash-object", "-w", "--stdin"], { input: Buffer.from(content) });
  for (const selected of [reference, byName]) expect(success(await f.store.read({ reference: selected })).content).toBe(content);
});
