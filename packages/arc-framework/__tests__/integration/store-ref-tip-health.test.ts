import { expect, it } from "vitest";

import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";

it("restores a nested record tree after point and history reads report recoverable object loss", async () => {
  const f = await createRefReadFixture();
  const uid = "12345678-1234-4234-8234-123456789abc", ref = `refs/arc/work/${uid}`;
  const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: "alpha", uid }, kind: "review/evidence", key: "good" });
  const planted = await plantRef(f.root, ref, [
    { path: `metadata-${uid}.json`, content: canonicalize({ formatVersion: 1, slug: "alpha", formats: {},
      primary: { role: "work-item/meta", placement: { kind: "active" } } }) },
    { path: `review/evidence-good-${uid}.json`, content: "{}" },
  ]);
  const tree = (await f.exec("git", ["rev-parse", `${planted.tree}:review`])).stdout.trim();
  const bytes = (await f.ports.rawExec(["cat-file", "tree", tree], { cwd: f.root })).stdout;
  await removeLooseObject(f.root, tree);
  for (const result of [await f.store.read({ reference }), await f.store.history({ reference })]) {
    expect(result).toMatchObject({ status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", historyRefs: [],
      remedy: { text: expect.stringMatching(/restore|fetch/iu) },
    } });
  }
  const restored = await f.ports.rawExec(["hash-object", "-w", "-t", "tree", "--stdin"], { cwd: f.root, input: bytes });
  expect(Buffer.from(restored.stdout).toString().trim()).toBe(tree);
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: "{}" } });
  expect(await f.store.history({ reference })).toMatchObject({ status: "ok" });
});

it.each([
  { label: "unparseable", content: "not JSON", condition: /cannot be parsed/u },
  { label: "absent", content: undefined, condition: /no metadata entry/u },
])("keeps $label endpoint metadata terminal with current and saved repair routes", async ({ content, condition }) => {
  const f = await createRefFixture(), reference = f.reference("personal/document"), home = expandStoredPath(reference);
  const from = await f.settle();
  await plantRef(f.root, home.ref, [
    ...content === undefined ? [] : [{ path: home.metadataPath, content }],
    { path: home.path, content: "Kept personal content.\n" },
  ]);
  expect(await f.store.history({ reference })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition,
    remedy: { text: expect.stringContaining("forward") },
  } });
  expect(await f.store.changes({ from, to: await f.settle(), references: [reference] })).toMatchObject({ status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", condition,
    remedy: { text: expect.stringContaining("ancestor") },
  } });
});
